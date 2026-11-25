import {
  type DbOrTx,
  newsletterDeliveries,
  newsletterPosts,
  newsletterSettings,
  newsletters,
  newsletterTranslations,
  posts,
  postViews,
  subscribers,
} from "@featherlog/db";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { actorLabel, actorUserId, assertCan, type Ctx } from "./auth";
import { AppError, notFound } from "./errors";
import { emit } from "./events";
import { newId } from "./ids";
import { isLocale } from "./locales";
import { hydratePosts, type Post } from "./posts";
import { getWorkspace } from "./workspaces";

export const NEWSLETTER_STATUSES = ["generating", "draft", "sending", "sent", "failed"] as const;
export type NewsletterStatus = (typeof NEWSLETTER_STATUSES)[number];
export type NewsletterGenerator = "ai" | "basic" | "manual";
export type NewsletterRow = typeof newsletters.$inferSelect;
export type NewsletterTranslation = {
  locale: string;
  subject: string;
  preheader: string;
  contentMd: string;
};
export type NewsletterPost = { postId: string; position: number; featured: boolean };
export type Newsletter = Omit<NewsletterRow, "status"> & {
  status: NewsletterStatus;
  translations: Record<string, NewsletterTranslation>;
  posts: NewsletterPost[];
};
export type NewsletterSettings = typeof newsletterSettings.$inferSelect;

const localeKey = z.string().refine(isLocale, "Unsupported locale");

export const NewsletterTranslationInput = z.object({
  subject: z.string().trim().min(1, "Subject is required").max(200),
  preheader: z.string().trim().max(250).default(""),
  contentMd: z.string().max(100_000).default(""),
});

export const CreateNewsletterInput = z.object({
  /** Posts to include. Defaults to every published post not sent in a newsletter yet. */
  postIds: z.array(z.string()).min(1).max(200).optional(),
  /** `generating`: an AI writer fills it in next. `draft`: ready to edit. */
  status: z.enum(["generating", "draft"]).default("draft"),
  generator: z.enum(["ai", "basic", "manual"]).default("manual"),
  translations: z.record(localeKey, NewsletterTranslationInput).optional(),
  featuredPostIds: z.array(z.string()).optional(),
});

export const UpdateNewsletterSettingsInput = z
  .object({
    fromName: z.string().trim().max(100).nullable(),
    replyTo: z
      .email()
      .nullable()
      .or(z.literal("").transform(() => null)),
    footerText: z.string().max(1000),
    aiInstructions: z.string().max(4000),
    skipReaders: z.boolean(),
  })
  .partial();

function inTx<T>(ctx: Ctx, fn: (ctx: Ctx) => Promise<T>): Promise<T> {
  return ctx.db.transaction((tx) => fn({ ...ctx, db: tx }));
}

async function hydrate(db: DbOrTx, rows: NewsletterRow[]): Promise<Newsletter[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [trs, nps] = await Promise.all([
    db
      .select()
      .from(newsletterTranslations)
      .where(inArray(newsletterTranslations.newsletterId, ids)),
    db
      .select()
      .from(newsletterPosts)
      .where(inArray(newsletterPosts.newsletterId, ids))
      .orderBy(asc(newsletterPosts.position)),
  ]);
  return rows.map((r) => ({
    ...r,
    status: r.status as NewsletterStatus,
    translations: Object.fromEntries(
      trs
        .filter((t) => t.newsletterId === r.id)
        .map((t) => [
          t.locale,
          { locale: t.locale, subject: t.subject, preheader: t.preheader, contentMd: t.contentMd },
        ]),
    ),
    posts: nps
      .filter((p) => p.newsletterId === r.id)
      .map((p) => ({ postId: p.postId, position: p.position, featured: p.featured })),
  }));
}

async function loadRow(ctx: Ctx, id: string, forUpdate = false) {
  const q = ctx.db
    .select()
    .from(newsletters)
    .where(and(eq(newsletters.id, id), eq(newsletters.workspaceId, ctx.workspaceId)));
  const [row] = forUpdate ? await q.for("update") : await q;
  if (!row) throw notFound("Newsletter");
  return row;
}

function assertEditable(row: NewsletterRow) {
  if (row.status !== "draft" && row.status !== "failed")
    throw new AppError("conflict", `A newsletter that is ${row.status} can't be changed`);
}

/* ---------- reading ---------- */

/** Published posts that have not gone out in any newsletter yet, oldest first. */
export async function listCandidatePosts(ctx: Ctx): Promise<Post[]> {
  assertCan(ctx, "newsletters:read");
  const rows = await ctx.db
    .select()
    .from(posts)
    .where(
      and(
        eq(posts.workspaceId, ctx.workspaceId),
        isNull(posts.deletedAt),
        eq(posts.published, true),
        sql`${posts.publishedAt} <= now()`,
        sql`not exists (select 1 from ${newsletterPosts} where ${newsletterPosts.postId} = ${posts.id})`,
      ),
    )
    .orderBy(asc(posts.publishedAt), asc(posts.id));
  return hydratePosts(ctx.db, rows);
}

export async function getNewsletter(ctx: Ctx, id: string): Promise<Newsletter> {
  assertCan(ctx, "newsletters:read");
  return (await hydrate(ctx.db, [await loadRow(ctx, id)]))[0]!;
}

export async function listNewsletters(ctx: Ctx, opts: { limit?: number } = {}) {
  assertCan(ctx, "newsletters:read");
  const rows = await ctx.db
    .select()
    .from(newsletters)
    .where(eq(newsletters.workspaceId, ctx.workspaceId))
    .orderBy(desc(newsletters.createdAt), desc(newsletters.id))
    .limit(Math.min(opts.limit ?? 50, 200));
  return hydrate(ctx.db, rows);
}

/* ---------- writing ---------- */

async function createImpl(ctx: Ctx, raw: z.input<typeof CreateNewsletterInput>) {
  assertCan(ctx, "newsletters:write");
  const input = CreateNewsletterInput.parse(raw);
  const ws = await getWorkspace(ctx.db, ctx.workspaceId);
  if (input.translations)
    for (const l of Object.keys(input.translations))
      if (!ws.locales.includes(l))
        throw new AppError("validation", `Language ${l} is not enabled in this workspace`);

  const candidates = await listCandidatePosts(ctx);
  let chosen = candidates;
  if (input.postIds) {
    const byId = new Map(candidates.map((p) => [p.id, p]));
    const missing = input.postIds.filter((id) => !byId.has(id));
    if (missing.length)
      throw new AppError(
        "validation",
        "Some posts are not published or already went out in a newsletter",
        { postIds: missing },
      );
    chosen = input.postIds.map((id) => byId.get(id)!);
  }
  if (chosen.length === 0)
    throw new AppError("validation", "There are no new published posts since the last newsletter");

  const dates = chosen.map((p) => p.publishedAt!.getTime());
  const id = newId();
  const [row] = await ctx.db
    .insert(newsletters)
    .values({
      id,
      workspaceId: ctx.workspaceId,
      status: input.status,
      generator: input.generator,
      periodFrom: new Date(Math.min(...dates)),
      periodTo: new Date(Math.max(...dates)),
      createdVia: ctx.via,
      createdBy: actorUserId(ctx.actor),
      actorLabel: actorLabel(ctx.actor),
    })
    .returning();
  const featured = new Set(input.featuredPostIds ?? []);
  try {
    await ctx.db.insert(newsletterPosts).values(
      chosen.map((p, i) => ({
        newsletterId: id,
        postId: p.id,
        position: i,
        featured: featured.has(p.id),
      })),
    );
  } catch (e) {
    // newsletter_posts_post_idx: another newsletter took one of these posts meanwhile.
    throw new AppError("conflict", "Some of these posts were just added to another newsletter", {
      cause: String(e),
    });
  }
  if (input.translations)
    await ctx.db.insert(newsletterTranslations).values(
      Object.entries(input.translations).map(([locale, t]) => ({
        newsletterId: id,
        locale,
        ...t,
      })),
    );
  await emit(ctx.db, ctx.workspaceId, "newsletter.created", { id, posts: chosen.length });
  return (await hydrate(ctx.db, [row!]))[0]!;
}

/** Reserves posts for a new newsletter. A post can only be in one newsletter. */
export const createNewsletter = (ctx: Ctx, raw: z.input<typeof CreateNewsletterInput>) =>
  inTx(ctx, (c) => createImpl(c, raw));

/**
 * Stores what a writer produced (AI or basic) and turns the newsletter into an editable draft.
 * Called by background jobs; no actor.
 */
export async function completeNewsletterDraft(
  db: DbOrTx,
  workspaceId: string,
  id: string,
  draft: {
    generator: NewsletterGenerator;
    translations: Record<string, z.input<typeof NewsletterTranslationInput>>;
    /** New order and treatment; posts left out keep their place after the listed ones. */
    posts?: { postId: string; featured: boolean }[];
  },
) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(newsletters)
      .where(and(eq(newsletters.id, id), eq(newsletters.workspaceId, workspaceId)))
      .for("update");
    if (!row) throw notFound("Newsletter");
    if (row.status !== "generating" && row.status !== "failed")
      throw new AppError("conflict", "This newsletter is not waiting for a draft");
    await tx.delete(newsletterTranslations).where(eq(newsletterTranslations.newsletterId, id));
    const translations = Object.entries(draft.translations).map(([locale, t]) => ({
      newsletterId: id,
      locale,
      ...NewsletterTranslationInput.parse(t),
    }));
    if (translations.length) await tx.insert(newsletterTranslations).values(translations);
    if (draft.posts) {
      const current = await tx
        .select()
        .from(newsletterPosts)
        .where(eq(newsletterPosts.newsletterId, id))
        .orderBy(asc(newsletterPosts.position));
      const listed = draft.posts.filter((p) => current.some((c) => c.postId === p.postId));
      const rest = current.filter((c) => !listed.some((p) => p.postId === c.postId));
      const ordered = [...listed, ...rest.map((r) => ({ postId: r.postId, featured: r.featured }))];
      for (const [position, p] of ordered.entries())
        await tx
          .update(newsletterPosts)
          .set({ position, featured: p.featured })
          .where(and(eq(newsletterPosts.newsletterId, id), eq(newsletterPosts.postId, p.postId)));
    }
    await tx
      .update(newsletters)
      .set({
        status: "draft",
        generator: draft.generator,
        error: null,
        version: sql`${newsletters.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(newsletters.id, id));
  });
}

export async function failNewsletter(db: DbOrTx, workspaceId: string, id: string, error: string) {
  await db
    .update(newsletters)
    .set({ status: "failed", error: error.slice(0, 2000), updatedAt: new Date() })
    .where(and(eq(newsletters.id, id), eq(newsletters.workspaceId, workspaceId)));
}

/** Puts a draft (or failed) newsletter back in the queue for the writer. */
export async function markNewsletterGenerating(ctx: Ctx, id: string) {
  assertCan(ctx, "newsletters:write");
  return inTx(ctx, async (c) => {
    const row = await loadRow(c, id, true);
    assertEditable(row);
    await c.db
      .update(newsletters)
      .set({ status: "generating", error: null, updatedAt: new Date() })
      .where(eq(newsletters.id, id));
  });
}

export async function setNewsletterTranslation(
  ctx: Ctx,
  id: string,
  locale: string,
  raw: z.input<typeof NewsletterTranslationInput>,
  opts: { expectedVersion?: number } = {},
) {
  assertCan(ctx, "newsletters:write");
  const input = NewsletterTranslationInput.parse(raw);
  return inTx(ctx, async (c) => {
    const row = await loadRow(c, id, true);
    assertEditable(row);
    if (opts.expectedVersion !== undefined && opts.expectedVersion !== row.version)
      throw new AppError("precondition_failed", "The newsletter changed since you loaded it");
    const ws = await getWorkspace(c.db, c.workspaceId);
    if (!ws.locales.includes(locale))
      throw new AppError("validation", `Language ${locale} is not enabled in this workspace`);
    await c.db
      .insert(newsletterTranslations)
      .values({ newsletterId: id, locale, ...input })
      .onConflictDoUpdate({
        target: [newsletterTranslations.newsletterId, newsletterTranslations.locale],
        set: { ...input, updatedAt: new Date() },
      });
    await c.db
      .update(newsletters)
      .set({ version: row.version + 1, updatedAt: new Date() })
      .where(eq(newsletters.id, id));
    return (await hydrate(c.db, [{ ...row, version: row.version + 1 }]))[0]!;
  });
}

/** Takes posts out of a draft, so they can go in the next newsletter. */
export async function removeNewsletterPosts(ctx: Ctx, id: string, postIds: string[]) {
  assertCan(ctx, "newsletters:write");
  return inTx(ctx, async (c) => {
    const row = await loadRow(c, id, true);
    assertEditable(row);
    if (postIds.length)
      await c.db
        .delete(newsletterPosts)
        .where(and(eq(newsletterPosts.newsletterId, id), inArray(newsletterPosts.postId, postIds)));
    await c.db
      .update(newsletters)
      .set({ version: row.version + 1, updatedAt: new Date() })
      .where(eq(newsletters.id, id));
  });
}

/** Deletes a newsletter that was not sent. Its posts become candidates again. */
export async function deleteNewsletter(ctx: Ctx, id: string) {
  assertCan(ctx, "newsletters:write");
  return inTx(ctx, async (c) => {
    const row = await loadRow(c, id, true);
    if (row.status === "sending" || row.status === "sent")
      throw new AppError("conflict", "A newsletter that was sent can't be deleted");
    await c.db.delete(newsletters).where(eq(newsletters.id, id));
    await emit(c.db, c.workspaceId, "newsletter.deleted", { id });
  });
}

/* ---------- sending ---------- */

/** Picks the translation a subscriber gets: theirs, else the workspace default, else the first. */
export function newsletterLocaleFor(
  subscriberLocale: string | null,
  available: string[],
  defaultLocale: string,
): string {
  if (subscriberLocale && available.includes(subscriberLocale)) return subscriberLocale;
  if (available.includes(defaultLocale)) return defaultLocale;
  return available[0]!;
}

/**
 * Freezes the recipient list and marks the newsletter as sending. Only a person in the dashboard
 * can do this: integrations prepare drafts, never send them.
 */
export async function startSendingNewsletter(ctx: Ctx, id: string) {
  assertCan(ctx, "newsletters:write");
  if (ctx.via !== "panel")
    throw new AppError("forbidden", "Newsletters can only be sent from the dashboard");
  return inTx(ctx, async (c) => {
    const row = await loadRow(c, id, true);
    if (row.status !== "draft")
      throw new AppError("conflict", `A newsletter that is ${row.status} can't be sent`);
    const [nl] = await hydrate(c.db, [row]);
    const locales = Object.keys(nl!.translations);
    if (locales.length === 0) throw new AppError("validation", "Write the email before sending it");
    if (nl!.posts.length === 0) throw new AppError("validation", "The newsletter has no posts");
    const ws = await getWorkspace(c.db, c.workspaceId);
    const settings = await getNewsletterSettings(c.db, c.workspaceId);
    const recipients = await c.db
      .select({ id: subscribers.id, email: subscribers.email, locale: subscribers.locale })
      .from(subscribers)
      .where(recipientsWhere(c.workspaceId, id, settings.skipReaders));
    if (recipients.length === 0) throw new AppError("validation", "There are no subscribers");
    for (let i = 0; i < recipients.length; i += 1000)
      await c.db.insert(newsletterDeliveries).values(
        recipients.slice(i, i + 1000).map((s) => ({
          newsletterId: id,
          subscriberId: s.id,
          email: s.email,
          locale: newsletterLocaleFor(s.locale, locales, ws.defaultLocale),
        })),
      );
    const now = new Date();
    await c.db
      .update(newsletters)
      .set({
        status: "sending",
        sendStartedAt: now,
        sentBy: actorUserId(c.actor),
        recipients: recipients.length,
        version: row.version + 1,
        updatedAt: now,
      })
      .where(eq(newsletters.id, id));
    await emit(c.db, c.workspaceId, "newsletter.sending", { id, recipients: recipients.length });
    return { recipients: recipients.length };
  });
}

/**
 * Subscribed people, minus (with `skipReaders`) those who already saw every post of the newsletter
 * in the widget.
 */
function recipientsWhere(workspaceId: string, newsletterId: string, skipReaders: boolean) {
  const base = and(eq(subscribers.workspaceId, workspaceId), eq(subscribers.status, "subscribed"));
  if (!skipReaders) return base;
  return and(
    base,
    sql`(select count(*) from ${postViews} join ${newsletterPosts} on ${newsletterPosts.postId} = ${postViews.postId} where ${newsletterPosts.newsletterId} = ${newsletterId} and ${postViews.subscriberId} = ${subscribers.id} and ${postViews.source} = 'widget') < (select count(*) from ${newsletterPosts} where ${newsletterPosts.newsletterId} = ${newsletterId})`,
  );
}

/** Who a newsletter would go to now, and how many are skipped because they already read it. */
export async function countNewsletterRecipients(ctx: Ctx, newsletterId: string) {
  assertCan(ctx, "newsletters:read");
  const settings = await getNewsletterSettings(ctx.db, ctx.workspaceId);
  const count = async (skip: boolean) => {
    const [r] = await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(subscribers)
      .where(recipientsWhere(ctx.workspaceId, newsletterId, skip));
    return r?.n ?? 0;
  };
  const all = await count(false);
  const recipients = settings.skipReaders ? await count(true) : all;
  return { recipients, skippedReaders: all - recipients };
}

/** The next deliveries to send, and the newsletter they belong to. */
export async function pendingDeliveries(db: DbOrTx, newsletterId: string, limit: number) {
  return db
    .select()
    .from(newsletterDeliveries)
    .where(
      and(
        eq(newsletterDeliveries.newsletterId, newsletterId),
        eq(newsletterDeliveries.status, "pending"),
      ),
    )
    .orderBy(asc(newsletterDeliveries.subscriberId))
    .limit(limit);
}

export async function recordDelivery(
  db: DbOrTx,
  newsletterId: string,
  subscriberId: string,
  result: { ok: true } | { ok: false; error: string },
) {
  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(newsletterDeliveries)
      .set(
        result.ok
          ? { status: "sent", sentAt: new Date(), error: null }
          : { status: "failed", error: result.error.slice(0, 500) },
      )
      .where(
        and(
          eq(newsletterDeliveries.newsletterId, newsletterId),
          eq(newsletterDeliveries.subscriberId, subscriberId),
          eq(newsletterDeliveries.status, "pending"),
        ),
      )
      .returning({ status: newsletterDeliveries.status });
    if (!updated) return;
    await tx
      .update(newsletters)
      .set(
        result.ok
          ? { sentCount: sql`${newsletters.sentCount} + 1` }
          : { failedCount: sql`${newsletters.failedCount} + 1` },
      )
      .where(eq(newsletters.id, newsletterId));
  });
}

/** Marks the newsletter as sent once nothing is pending. Returns true when it is done. */
export async function finishSendingIfDone(db: DbOrTx, workspaceId: string, newsletterId: string) {
  const [pending] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(newsletterDeliveries)
    .where(
      and(
        eq(newsletterDeliveries.newsletterId, newsletterId),
        eq(newsletterDeliveries.status, "pending"),
      ),
    );
  if ((pending?.n ?? 0) > 0) return false;
  const [row] = await db
    .update(newsletters)
    .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
    .where(and(eq(newsletters.id, newsletterId), eq(newsletters.status, "sending")))
    .returning();
  if (row)
    await emit(db, workspaceId, "newsletter.sent", {
      id: newsletterId,
      sent: row.sentCount,
      failed: row.failedCount,
    });
  return true;
}

/** Newsletters left in `sending` (e.g. the server restarted mid-send), to resume them. */
export async function sendingNewsletterIds(db: DbOrTx) {
  return db
    .select({ id: newsletters.id, workspaceId: newsletters.workspaceId })
    .from(newsletters)
    .where(eq(newsletters.status, "sending"));
}

/** Newsletters stuck in `generating`, to retry them. */
export async function generatingNewsletterIds(db: DbOrTx) {
  return db
    .select({ id: newsletters.id, workspaceId: newsletters.workspaceId })
    .from(newsletters)
    .where(eq(newsletters.status, "generating"));
}

export async function deliveryStats(ctx: Ctx, id: string) {
  assertCan(ctx, "newsletters:read");
  await loadRow(ctx, id);
  return ctx.db
    .select({
      locale: newsletterDeliveries.locale,
      status: newsletterDeliveries.status,
      n: sql<number>`count(*)::int`,
    })
    .from(newsletterDeliveries)
    .where(eq(newsletterDeliveries.newsletterId, id))
    .groupBy(newsletterDeliveries.locale, newsletterDeliveries.status);
}

/** Subscribers that would receive a newsletter now, by locale (for the confirmation dialog). */
export async function countRecipients(ctx: Ctx) {
  assertCan(ctx, "newsletters:read");
  const [r] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(subscribers)
    .where(and(eq(subscribers.workspaceId, ctx.workspaceId), eq(subscribers.status, "subscribed")));
  return r?.n ?? 0;
}

/* ---------- settings ---------- */

export async function getNewsletterSettings(
  db: DbOrTx,
  workspaceId: string,
): Promise<NewsletterSettings> {
  const [row] = await db
    .select()
    .from(newsletterSettings)
    .where(eq(newsletterSettings.workspaceId, workspaceId));
  if (row) return row;
  const [created] = await db
    .insert(newsletterSettings)
    .values({ workspaceId })
    .onConflictDoNothing()
    .returning();
  return created ?? (await getNewsletterSettings(db, workspaceId));
}

export async function updateNewsletterSettings(
  ctx: Ctx,
  raw: z.input<typeof UpdateNewsletterSettingsInput>,
) {
  assertCan(ctx, "settings:write");
  const input = UpdateNewsletterSettingsInput.parse(raw);
  await getNewsletterSettings(ctx.db, ctx.workspaceId);
  const [row] = await ctx.db
    .update(newsletterSettings)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(newsletterSettings.workspaceId, ctx.workspaceId))
    .returning();
  return row!;
}

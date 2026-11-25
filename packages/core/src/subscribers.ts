import { type DbOrTx, newsletterDeliveries, newsletters, subscribers } from "@featherlog/db";
import { and, desc, eq, ilike, lt, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { assertCan, type Ctx } from "./auth";
import { AppError, notFound } from "./errors";
import { emit } from "./events";
import { newId } from "./ids";
import { LOCALE_CODES, negotiateLocale } from "./locales";
import { MAX_SUBSCRIBER_BATCH } from "./subscriber-csv";

export type Subscriber = typeof subscribers.$inferSelect;
export const SUBSCRIBER_STATUSES = ["subscribed", "unsubscribed", "bounced"] as const;
export type SubscriberStatus = (typeof SUBSCRIBER_STATUSES)[number];
export const SUBSCRIBER_SOURCES = ["api", "import", "panel"] as const;
export type SubscriberSource = (typeof SUBSCRIBER_SOURCES)[number];

export const UpsertSubscriberInput = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  /** Id of the person in the app that keeps the list in sync. */
  externalId: z.string().trim().min(1).max(200).optional(),
  name: z.string().trim().max(200).nullish(),
  /** Any language tag ("es", "fr-FR"…). Unsupported languages fall back to the workspace default. */
  locale: z.string().trim().max(35).nullish(),
  attributes: z.record(z.string(), z.string().max(500)).optional(),
  /**
   * `true` opts the person out. `false` or absent never re-subscribes someone who unsubscribed:
   * only the person (or a workspace admin in the panel) can do that.
   */
  unsubscribed: z.boolean().optional(),
});
export type UpsertSubscriberInput = z.input<typeof UpsertSubscriberInput>;

export const ListSubscribersInput = z.object({
  status: z.enum(["all", ...SUBSCRIBER_STATUSES]).default("all"),
  q: z.string().trim().max(200).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type UpsertResult = "created" | "updated" | "unchanged";

/** Maps a language tag to a supported locale, or null (= workspace default). */
export function normalizeSubscriberLocale(tag: string | null | undefined): string | null {
  return tag ? negotiateLocale(tag, LOCALE_CODES, "") || null : null;
}

/** Key order doesn't matter (Postgres jsonb reorders keys). */
function sameAttributes(a: Record<string, string>, b: Record<string, string>) {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

function inTx<T>(ctx: Ctx, fn: (ctx: Ctx) => Promise<T>): Promise<T> {
  return ctx.db.transaction((tx) => fn({ ...ctx, db: tx }));
}

async function findOne(db: DbOrTx, workspaceId: string, where: SQL) {
  const [row] = await db
    .select()
    .from(subscribers)
    .where(and(eq(subscribers.workspaceId, workspaceId), where));
  return row ?? null;
}

async function upsertOne(
  ctx: Ctx,
  input: z.output<typeof UpsertSubscriberInput>,
  source: SubscriberSource,
): Promise<{ subscriber: Subscriber; result: UpsertResult }> {
  const ws = ctx.workspaceId;
  const byExternal = input.externalId
    ? await findOne(ctx.db, ws, eq(subscribers.externalId, input.externalId))
    : null;
  const byEmail = await findOne(ctx.db, ws, eq(subscribers.email, input.email));
  let existing = byExternal ?? byEmail;
  let carriedOptOut = false;

  // The person changed their email to one that already has its own row (e.g. imported from a
  // CSV before the sync existed): keep one row, and keep the opt-out if either had it.
  if (byExternal && byEmail && byExternal.id !== byEmail.id) {
    carriedOptOut = byEmail.status !== "subscribed";
    await ctx.db.delete(subscribers).where(eq(subscribers.id, byEmail.id));
  }

  const locale =
    input.locale === undefined ? undefined : normalizeSubscriberLocale(input.locale ?? null);
  const now = new Date();

  if (!existing) {
    const optedOut = input.unsubscribed === true;
    const [row] = await ctx.db
      .insert(subscribers)
      .values({
        id: newId(),
        workspaceId: ws,
        email: input.email,
        externalId: input.externalId ?? null,
        name: input.name ?? null,
        locale: locale ?? null,
        attributes: input.attributes ?? {},
        status: optedOut ? "unsubscribed" : "subscribed",
        unsubscribedAt: optedOut ? now : null,
        source,
      })
      .returning();
    return { subscriber: row!, result: "created" };
  }

  const patch: Partial<typeof subscribers.$inferInsert> = {};
  if (existing.email !== input.email) patch.email = input.email;
  if (input.externalId && existing.externalId !== input.externalId)
    patch.externalId = input.externalId;
  if (input.name !== undefined && existing.name !== (input.name ?? null))
    patch.name = input.name ?? null;
  if (locale !== undefined && existing.locale !== locale) patch.locale = locale;
  if (input.attributes !== undefined && !sameAttributes(existing.attributes, input.attributes))
    patch.attributes = input.attributes;
  // A bounced address that changed is worth trying again; an opt-out never is.
  if (patch.email && existing.status === "bounced" && !input.unsubscribed && !carriedOptOut)
    patch.status = "subscribed";
  if ((input.unsubscribed === true || carriedOptOut) && existing.status !== "unsubscribed") {
    patch.status = "unsubscribed";
    patch.unsubscribedAt = now;
  }

  if (Object.keys(patch).length === 0) return { subscriber: existing, result: "unchanged" };
  const [row] = await ctx.db
    .update(subscribers)
    .set({ ...patch, updatedAt: now })
    .where(eq(subscribers.id, existing.id))
    .returning();
  existing = row!;
  if (patch.status === "unsubscribed")
    await emit(ctx.db, ws, "subscriber.unsubscribed", { id: existing.id, via: ctx.via });
  return { subscriber: existing, result: "updated" };
}

/** Creates or updates one subscriber, matched by `externalId` first, then by email. */
export async function upsertSubscriber(
  ctx: Ctx,
  raw: UpsertSubscriberInput,
  opts: { source?: SubscriberSource } = {},
) {
  assertCan(ctx, "subscribers:write");
  const input = UpsertSubscriberInput.parse(raw);
  return inTx(ctx, (c) => upsertOne(c, input, opts.source ?? sourceOf(ctx)));
}

/** Upserts up to {@link MAX_SUBSCRIBER_BATCH} subscribers in one transaction. */
export async function upsertSubscribersBatch(
  ctx: Ctx,
  raw: UpsertSubscriberInput[],
  opts: { source?: SubscriberSource } = {},
) {
  assertCan(ctx, "subscribers:write");
  if (raw.length > MAX_SUBSCRIBER_BATCH)
    throw new AppError("validation", `At most ${MAX_SUBSCRIBER_BATCH} subscribers per batch`);
  const inputs = z.array(UpsertSubscriberInput).parse(raw);
  const seen = new Set<string>();
  for (const i of inputs) {
    const key = i.externalId ? `x:${i.externalId}` : `e:${i.email}`;
    if (seen.has(key))
      throw new AppError("validation", `Duplicate subscriber in batch: ${i.externalId ?? i.email}`);
    seen.add(key);
  }
  return inTx(ctx, async (c) => {
    const counts = { created: 0, updated: 0, unchanged: 0 };
    for (const input of inputs) {
      const { result } = await upsertOne(c, input, opts.source ?? sourceOf(ctx));
      counts[result]++;
    }
    return counts;
  });
}

function sourceOf(ctx: Ctx): SubscriberSource {
  return ctx.via === "panel" ? "panel" : "api";
}

export type SubscriberRef = { id: string } | { externalId: string } | { email: string };

function refWhere(ref: SubscriberRef): SQL {
  if ("id" in ref) return eq(subscribers.id, ref.id);
  if ("externalId" in ref) return eq(subscribers.externalId, ref.externalId);
  return eq(subscribers.email, ref.email.trim().toLowerCase());
}

export async function getSubscriber(ctx: Ctx, ref: SubscriberRef) {
  assertCan(ctx, "subscribers:read");
  const row = await findOne(ctx.db, ctx.workspaceId, refWhere(ref));
  if (!row) throw notFound("Subscriber");
  return row;
}

/** Deletes a subscriber (e.g. the person's account was deleted in the syncing app). */
export async function removeSubscriber(ctx: Ctx, ref: SubscriberRef) {
  assertCan(ctx, "subscribers:write");
  const [row] = await ctx.db
    .delete(subscribers)
    .where(and(eq(subscribers.workspaceId, ctx.workspaceId), refWhere(ref)))
    .returning({ id: subscribers.id });
  if (!row) throw notFound("Subscriber");
}

/** Opt-out from an email link: no actor, the caller has verified a signed token. */
export async function unsubscribeById(db: DbOrTx, workspaceId: string, id: string) {
  const row = await findOne(db, workspaceId, eq(subscribers.id, id));
  if (!row) throw notFound("Subscriber");
  if (row.status !== "subscribed") return row;
  const [updated] = await db
    .update(subscribers)
    .set({ status: "unsubscribed", unsubscribedAt: new Date(), updatedAt: new Date() })
    .where(eq(subscribers.id, id))
    .returning();
  await emit(db, workspaceId, "subscriber.unsubscribed", { id, via: "email" });
  return updated!;
}

export type EmailFeedback = "bounced" | "complained" | "unsubscribed";

/**
 * Applies what the email provider reported about a message (e.g. a Mailgun webhook): a permanent
 * bounce marks the subscriber `bounced`; a spam complaint or the provider's own unsubscribe opts
 * them out. With `newsletterId`, a bounced delivery is moved from sent to failed.
 * No actor: the caller has verified the provider's signature. Returns null for unknown ids.
 */
export async function applyEmailFeedback(
  db: DbOrTx,
  input: {
    workspaceId: string;
    subscriberId: string;
    newsletterId?: string | null;
    kind: EmailFeedback;
    reason?: string;
  },
) {
  return db.transaction(async (tx) => {
    const row = await findOne(tx, input.workspaceId, eq(subscribers.id, input.subscriberId));
    if (!row) return null;
    const now = new Date();
    let status = row.status as SubscriberStatus;
    if (input.kind === "bounced" && row.status === "subscribed") {
      status = "bounced";
      await tx
        .update(subscribers)
        .set({ status, updatedAt: now })
        .where(eq(subscribers.id, row.id));
      await emit(tx, input.workspaceId, "subscriber.bounced", {
        id: row.id,
        reason: input.reason ?? null,
      });
    } else if (input.kind !== "bounced" && row.status !== "unsubscribed") {
      status = "unsubscribed";
      await tx
        .update(subscribers)
        .set({ status, unsubscribedAt: now, updatedAt: now })
        .where(eq(subscribers.id, row.id));
      await emit(tx, input.workspaceId, "subscriber.unsubscribed", {
        id: row.id,
        via: input.kind === "complained" ? "complaint" : "provider",
      });
    }
    if (input.kind === "bounced" && input.newsletterId) {
      const [moved] = await tx
        .update(newsletterDeliveries)
        .set({ status: "failed", error: (input.reason ?? "Bounced").slice(0, 500) })
        .where(
          and(
            eq(newsletterDeliveries.newsletterId, input.newsletterId),
            eq(newsletterDeliveries.subscriberId, row.id),
            eq(newsletterDeliveries.status, "sent"),
          ),
        )
        .returning({ id: newsletterDeliveries.subscriberId });
      if (moved)
        await tx
          .update(newsletters)
          .set({
            sentCount: sql`greatest(${newsletters.sentCount} - 1, 0)`,
            failedCount: sql`${newsletters.failedCount} + 1`,
          })
          .where(
            and(
              eq(newsletters.id, input.newsletterId),
              eq(newsletters.workspaceId, input.workspaceId),
            ),
          );
    }
    return { status };
  });
}

/** Sets the status by hand. Re-subscribing is only allowed from the panel. */
export async function setSubscriberStatus(ctx: Ctx, id: string, status: SubscriberStatus) {
  assertCan(ctx, "subscribers:write");
  if (status === "subscribed" && ctx.via !== "panel")
    throw new AppError("forbidden", "Only a person in the dashboard can re-subscribe someone");
  const row = await findOne(ctx.db, ctx.workspaceId, eq(subscribers.id, id));
  if (!row) throw notFound("Subscriber");
  if (row.status === status) return row;
  const [updated] = await ctx.db
    .update(subscribers)
    .set({
      status,
      unsubscribedAt: status === "subscribed" ? null : (row.unsubscribedAt ?? new Date()),
      updatedAt: new Date(),
    })
    .where(eq(subscribers.id, id))
    .returning();
  if (status === "unsubscribed")
    await emit(ctx.db, ctx.workspaceId, "subscriber.unsubscribed", { id, via: ctx.via });
  return updated!;
}

/* ---------- listing ---------- */

function encodeCursor(s: Subscriber) {
  return Buffer.from(`${s.createdAt.toISOString()}|${s.id}`).toString("base64url");
}

function decodeCursor(cursor: string): { at: Date; id: string } | null {
  try {
    const [at, id] = Buffer.from(cursor, "base64url").toString().split("|");
    if (!at || !id) return null;
    const date = new Date(at);
    return Number.isNaN(date.getTime()) ? null : { at: date, id };
  } catch {
    return null;
  }
}

export async function listSubscribers(ctx: Ctx, raw: z.input<typeof ListSubscribersInput> = {}) {
  assertCan(ctx, "subscribers:read");
  const input = ListSubscribersInput.parse(raw);
  const where: SQL[] = [eq(subscribers.workspaceId, ctx.workspaceId)];
  if (input.status !== "all") where.push(eq(subscribers.status, input.status));
  if (input.q) {
    const like = `%${input.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where.push(
      or(
        ilike(subscribers.email, like),
        ilike(subscribers.name, like),
        ilike(subscribers.externalId, like),
      )!,
    );
  }
  const cursor = input.cursor ? decodeCursor(input.cursor) : null;
  if (cursor) {
    const at = sql`${cursor.at.toISOString()}::timestamptz`;
    where.push(
      or(
        sql`${subscribers.createdAt} < ${at}`,
        and(sql`${subscribers.createdAt} = ${at}`, lt(subscribers.id, cursor.id)),
      )!,
    );
  }
  const rows = await ctx.db
    .select()
    .from(subscribers)
    .where(and(...where))
    .orderBy(desc(subscribers.createdAt), desc(subscribers.id))
    .limit(input.limit + 1);
  const page = rows.slice(0, input.limit);
  const last = page[page.length - 1];
  return {
    items: page,
    nextCursor: rows.length > input.limit && last ? encodeCursor(last) : null,
  };
}

export async function countSubscribers(ctx: Ctx) {
  assertCan(ctx, "subscribers:read");
  const [r] = await ctx.db
    .select({
      all: sql<number>`count(*)::int`,
      subscribed: sql<number>`count(*) filter (where ${subscribers.status} = 'subscribed')::int`,
      unsubscribed: sql<number>`count(*) filter (where ${subscribers.status} = 'unsubscribed')::int`,
      bounced: sql<number>`count(*) filter (where ${subscribers.status} = 'bounced')::int`,
    })
    .from(subscribers)
    .where(eq(subscribers.workspaceId, ctx.workspaceId));
  return r ?? { all: 0, subscribed: 0, unsubscribed: 0, bounced: 0 };
}

import {
  type DbOrTx,
  memberships,
  postCategories,
  posts,
  postTranslations,
  user,
} from "@featherlog/db";
import { type MdCategory, renderMarkdown } from "@featherlog/markdown";
import { and, desc, eq, exists, ilike, inArray, isNull, lt, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { actorLabel, actorUserId, assertCan, type Ctx, can } from "./auth";
import { type Category, categoryName, listCategories } from "./categories";
import { AppError, forbidden, notFound } from "./errors";
import { emit } from "./events";
import { newId, newPostPublicId, slugify } from "./ids";
import { isLocale } from "./locales";
import { getWorkspace, type Workspace } from "./workspaces";

export type PostStatus = "draft" | "scheduled" | "published";

export type PostTranslation = {
  locale: string;
  title: string;
  slug: string;
  contentMd: string;
  contentHtml: string;
  excerpt: string;
  text: string;
  updatedAt: Date;
};

export type PostAuthor = {
  id: string;
  name: string;
  displayName: string | null;
  image: string | null;
  jobTitle: string | null;
};

export type Post = {
  id: string;
  publicId: string;
  status: PostStatus;
  published: boolean;
  publishedAt: Date | null;
  author: PostAuthor | null;
  createdVia: string;
  actorLabel: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  categoryIds: string[];
  translations: Record<string, PostTranslation>;
};

export function postStatus(
  p: { published: boolean; publishedAt: Date | null },
  now = new Date(),
): PostStatus {
  if (!p.published) return "draft";
  if (p.publishedAt && p.publishedAt.getTime() > now.getTime()) return "scheduled";
  return "published";
}

const localeKey = z.string().refine(isLocale, "Unsupported locale");
const dateInput = z.coerce.date();

export const TranslationInput = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  contentMd: z.string().max(100_000).default(""),
});

export const CreatePostInput = z.object({
  translations: z
    .record(localeKey, TranslationInput)
    .refine((r) => Object.keys(r).length > 0, "At least one translation is required"),
  /** Publication date. In the future → scheduled (once published). Defaults to now on publish. */
  publishedAt: dateInput.nullable().optional(),
  /** Publish right away (or schedule, if `publishedAt` is in the future). Defaults to false (draft). */
  publish: z.boolean().default(false),
  authorId: z.string().nullable().optional(),
});

export const UpdatePostInput = z.object({
  translations: z.record(localeKey, TranslationInput.partial().nullable()).optional(),
  publishedAt: dateInput.nullable().optional(),
  authorId: z.string().nullable().optional(),
});

export const ListPostsInput = z.object({
  status: z.enum(["all", "draft", "scheduled", "published"]).default("all"),
  locale: localeKey.optional(),
  /** Only posts missing a translation in this locale. */
  missingLocale: localeKey.optional(),
  categoryId: z.string().optional(),
  q: z.string().trim().max(200).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/* ------------------------------------------------------------------ */

async function hydrate(db: DbOrTx, rows: (typeof posts.$inferSelect)[]): Promise<Post[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [translations, cats, authors] = await Promise.all([
    db.select().from(postTranslations).where(inArray(postTranslations.postId, ids)),
    db.select().from(postCategories).where(inArray(postCategories.postId, ids)),
    db
      .select({
        id: user.id,
        name: user.name,
        displayName: user.displayName,
        image: user.image,
        jobTitle: user.jobTitle,
      })
      .from(user)
      .where(
        inArray(
          user.id,
          rows.map((r) => r.authorId).filter((x): x is string => !!x),
        ),
      ),
  ]);
  const now = new Date();
  return rows.map((r) => ({
    id: r.id,
    publicId: r.publicId,
    status: postStatus(r, now),
    published: r.published,
    publishedAt: r.publishedAt,
    author: authors.find((a) => a.id === r.authorId) ?? null,
    createdVia: r.createdVia,
    actorLabel: r.actorLabel,
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    categoryIds: cats.filter((c) => c.postId === r.id).map((c) => c.categoryId),
    translations: Object.fromEntries(
      translations
        .filter((t) => t.postId === r.id)
        .map((t) => [
          t.locale,
          {
            locale: t.locale,
            title: t.title,
            slug: t.slug,
            contentMd: t.contentMd,
            contentHtml: t.contentHtml,
            excerpt: t.excerpt,
            text: t.text,
            updatedAt: t.updatedAt,
          },
        ]),
    ),
  }));
}

/**
 * Categories for rendering a translation in `locale`. The chip shows the name in `locale`; markers
 * may also use the default-locale name or any other locale's name (in that priority order).
 */
function mdCategories(cats: Category[], locale: string, fallback: string): MdCategory[] {
  return cats.map((c) => {
    const own = c.names[locale];
    const others = Object.entries(c.names)
      .filter(([l]) => l !== locale && l !== fallback)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, n]) => n);
    const aliases = [c.names[fallback], ...others].filter((n): n is string => !!n && n !== own);
    return {
      id: c.id,
      name: categoryName(c, locale, fallback),
      color: c.color,
      aliases,
      // Without a name in this locale the display name is a fallback: match it as an alias only.
      matchName: own !== undefined,
    };
  });
}

async function renderTranslation(
  title: string,
  contentMd: string,
  locale: string,
  cats: Category[],
  fallbackLocale: string,
) {
  const r = await renderMarkdown(contentMd, {
    categories: mdCategories(cats, locale, fallbackLocale),
  });
  return {
    title,
    slug: slugify(title),
    contentMd,
    contentHtml: r.html,
    text: r.text,
    excerpt: r.excerpt,
    categoryIds: r.categoryIds,
  };
}

/** Re-renders every translation and syncs `post_categories` from the inline `[Category]` markers. */
async function syncRendered(db: DbOrTx, ws: Workspace, postId: string) {
  const cats = await listCategories(db, ws.id);
  const rows = await db.select().from(postTranslations).where(eq(postTranslations.postId, postId));
  const categoryIds = new Set<string>();
  for (const t of rows) {
    const r = await renderTranslation(t.title, t.contentMd, t.locale, cats, ws.defaultLocale);
    for (const id of r.categoryIds) categoryIds.add(id);
    await db
      .update(postTranslations)
      .set({ slug: r.slug, contentHtml: r.contentHtml, text: r.text, excerpt: r.excerpt })
      .where(and(eq(postTranslations.postId, postId), eq(postTranslations.locale, t.locale)));
  }
  await db.delete(postCategories).where(eq(postCategories.postId, postId));
  if (categoryIds.size > 0) {
    await db
      .insert(postCategories)
      .values([...categoryIds].map((categoryId) => ({ postId, categoryId })));
  }
}

async function assertAuthor(db: DbOrTx, workspaceId: string, authorId: string) {
  const [m] = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, authorId)));
  if (!m)
    throw new AppError("validation", "The author must be a member of this workspace", {
      field: "authorId",
    });
}

/** Integrations (API/MCP) can only publish — or touch published posts — when the workspace allows it. */
function assertIntegrationMayPublish(ctx: Ctx, ws: Workspace) {
  if (ctx.via !== "panel" && !ws.integrationsCanPublish) {
    throw forbidden(
      "Publishing from integrations is disabled for this workspace. A workspace admin can enable it in Settings → API.",
    );
  }
}

function assertCanEdit(ctx: Ctx, post: { authorId: string | null }) {
  assertCan(ctx, "posts:write");
  if (can(ctx.actor, "posts:write_any")) return;
  if (post.authorId && post.authorId === actorUserId(ctx.actor)) return;
  throw forbidden("You can only edit your own posts");
}

function assertVersion(row: { version: number }, expectedVersion: number | undefined) {
  if (expectedVersion !== undefined && expectedVersion !== row.version) {
    throw new AppError(
      "precondition_failed",
      "The post was modified by someone else. Reload and try again.",
      {
        currentVersion: row.version,
      },
    );
  }
}

async function loadRow(ctx: Ctx, id: string) {
  const [row] = await ctx.db
    .select()
    .from(posts)
    .where(
      and(
        eq(posts.workspaceId, ctx.workspaceId),
        or(eq(posts.id, id), eq(posts.publicId, id)),
        isNull(posts.deletedAt),
      ),
    );
  if (!row) throw notFound("Post");
  return row;
}

/** Runs a mutation atomically: rendering, category sync and the outbox event commit together. */
function inTx<T>(ctx: Ctx, fn: (ctx: Ctx) => Promise<T>): Promise<T> {
  return ctx.db.transaction((tx) => fn({ ...ctx, db: tx }));
}

/* ------------------------------------------------------------------ */

export async function getPost(ctx: Ctx, id: string): Promise<Post> {
  assertCan(ctx, "posts:read");
  const row = await loadRow(ctx, id);
  return (await hydrate(ctx.db, [row]))[0]!;
}

async function createPostImpl(ctx: Ctx, raw: z.input<typeof CreatePostInput>): Promise<Post> {
  assertCan(ctx, "posts:write");
  const input = CreatePostInput.parse(raw);
  const ws = await getWorkspace(ctx.db, ctx.workspaceId);
  for (const locale of Object.keys(input.translations)) {
    if (!ws.locales.includes(locale)) {
      throw new AppError("validation", `Locale "${locale}" is not enabled for this workspace`, {
        locale,
      });
    }
  }
  if (input.publish) {
    assertCan(ctx, "posts:publish");
    assertIntegrationMayPublish(ctx, ws);
  }
  let authorId = actorUserId(ctx.actor);
  if (input.authorId !== undefined) {
    if (input.authorId) await assertAuthor(ctx.db, ws.id, input.authorId);
    authorId = input.authorId;
  }

  const id = newId();
  await ctx.db.insert(posts).values({
    id,
    workspaceId: ws.id,
    publicId: newPostPublicId(),
    authorId,
    published: input.publish,
    publishedAt: input.publishedAt ?? (input.publish ? new Date() : null),
    createdVia: ctx.via,
    actorLabel: actorLabel(ctx.actor),
  });
  for (const [locale, t] of Object.entries(input.translations)) {
    await ctx.db.insert(postTranslations).values({
      postId: id,
      locale,
      title: t.title,
      slug: slugify(t.title),
      contentMd: t.contentMd,
    });
  }
  await syncRendered(ctx.db, ws, id);
  const post = await getPost(ctx, id);
  await emit(ctx.db, ws.id, "post.created", { id, status: post.status });
  if (post.published)
    await emit(ctx.db, ws.id, "post.published", { id, publishedAt: post.publishedAt });
  return post;
}

async function updatePostImpl(
  ctx: Ctx,
  id: string,
  raw: z.input<typeof UpdatePostInput>,
  opts: { expectedVersion?: number } = {},
): Promise<Post> {
  const input = UpdatePostInput.parse(raw);
  const row = await loadRow(ctx, id);
  assertCanEdit(ctx, row);
  assertVersion(row, opts.expectedVersion);
  const ws = await getWorkspace(ctx.db, ctx.workspaceId);
  if (row.published) assertIntegrationMayPublish(ctx, ws);

  const patch: Partial<typeof posts.$inferInsert> = {
    updatedAt: new Date(),
    version: row.version + 1,
  };
  if (input.publishedAt !== undefined) patch.publishedAt = input.publishedAt;
  if (input.authorId !== undefined) {
    if (input.authorId) await assertAuthor(ctx.db, ws.id, input.authorId);
    patch.authorId = input.authorId;
  }

  if (input.translations) {
    const existing = await ctx.db
      .select()
      .from(postTranslations)
      .where(eq(postTranslations.postId, row.id));
    for (const [locale, t] of Object.entries(input.translations)) {
      const current = existing.find((e) => e.locale === locale);
      if (t === null) {
        if (current && existing.length === 1) {
          throw new AppError("validation", "A post needs at least one translation");
        }
        await ctx.db
          .delete(postTranslations)
          .where(and(eq(postTranslations.postId, row.id), eq(postTranslations.locale, locale)));
        if (current) existing.splice(existing.indexOf(current), 1);
        continue;
      }
      if (!ws.locales.includes(locale)) {
        throw new AppError("validation", `Locale "${locale}" is not enabled for this workspace`, {
          locale,
        });
      }
      if (current) {
        await ctx.db
          .update(postTranslations)
          .set({
            ...(t.title !== undefined ? { title: t.title } : {}),
            ...(t.contentMd !== undefined ? { contentMd: t.contentMd } : {}),
            updatedAt: new Date(),
          })
          .where(and(eq(postTranslations.postId, row.id), eq(postTranslations.locale, locale)));
      } else {
        if (!t.title)
          throw new AppError(
            "validation",
            `A title is required for the new "${locale}" translation`,
          );
        await ctx.db.insert(postTranslations).values({
          postId: row.id,
          locale,
          title: t.title,
          slug: slugify(t.title),
          contentMd: t.contentMd ?? "",
        });
      }
    }
  }

  await ctx.db.update(posts).set(patch).where(eq(posts.id, row.id));
  await syncRendered(ctx.db, ws, row.id);
  await emit(ctx.db, ws.id, "post.updated", { id: row.id });
  return getPost(ctx, row.id);
}

export async function setTranslation(
  ctx: Ctx,
  id: string,
  locale: string,
  raw: z.input<typeof TranslationInput>,
  opts: { expectedVersion?: number } = {},
) {
  return updatePost(ctx, id, { translations: { [locale]: TranslationInput.parse(raw) } }, opts);
}

export async function deleteTranslation(
  ctx: Ctx,
  id: string,
  locale: string,
  opts: { expectedVersion?: number } = {},
) {
  return updatePost(ctx, id, { translations: { [locale]: null } }, opts);
}

/** Publishes now, or at `at` (scheduled) if it is in the future. */
async function publishPostImpl(
  ctx: Ctx,
  id: string,
  opts: { at?: Date | string | null; expectedVersion?: number } = {},
): Promise<Post> {
  assertCan(ctx, "posts:publish");
  const row = await loadRow(ctx, id);
  assertCanEdit(ctx, row);
  assertVersion(row, opts.expectedVersion);
  const ws = await getWorkspace(ctx.db, ctx.workspaceId);
  assertIntegrationMayPublish(ctx, ws);
  const at = opts.at ? dateInput.parse(opts.at) : (row.publishedAt ?? new Date());
  await ctx.db
    .update(posts)
    .set({ published: true, publishedAt: at, version: row.version + 1, updatedAt: new Date() })
    .where(eq(posts.id, row.id));
  await emit(ctx.db, ws.id, "post.published", { id: row.id, publishedAt: at });
  return getPost(ctx, row.id);
}

export async function schedulePost(
  ctx: Ctx,
  id: string,
  at: Date | string,
  opts: { expectedVersion?: number } = {},
) {
  const date = dateInput.parse(at);
  if (date.getTime() <= Date.now())
    throw new AppError("validation", "The scheduled date must be in the future");
  return publishPost(ctx, id, { at: date, expectedVersion: opts.expectedVersion });
}

async function unpublishPostImpl(
  ctx: Ctx,
  id: string,
  opts: { expectedVersion?: number } = {},
): Promise<Post> {
  assertCan(ctx, "posts:publish");
  const row = await loadRow(ctx, id);
  assertCanEdit(ctx, row);
  assertVersion(row, opts.expectedVersion);
  const ws = await getWorkspace(ctx.db, ctx.workspaceId);
  assertIntegrationMayPublish(ctx, ws);
  await ctx.db
    .update(posts)
    .set({ published: false, version: row.version + 1, updatedAt: new Date() })
    .where(eq(posts.id, row.id));
  await emit(ctx.db, ws.id, "post.unpublished", { id: row.id });
  return getPost(ctx, row.id);
}

async function deletePostImpl(ctx: Ctx, id: string, opts: { expectedVersion?: number } = {}) {
  const row = await loadRow(ctx, id);
  assertCanEdit(ctx, row);
  assertVersion(row, opts.expectedVersion);
  if (row.published) {
    const ws = await getWorkspace(ctx.db, ctx.workspaceId);
    assertIntegrationMayPublish(ctx, ws);
  }
  await ctx.db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, row.id));
  await emit(ctx.db, ctx.workspaceId, "post.deleted", { id: row.id });
}

/* ------------------------------------------------------------------ */

const sortKey = sql<Date>`coalesce(${posts.publishedAt}, ${posts.createdAt})`;

function encodeCursor(p: { publishedAt: Date | null; createdAt: Date; id: string }) {
  return Buffer.from(`${(p.publishedAt ?? p.createdAt).toISOString()}|${p.id}`).toString(
    "base64url",
  );
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

export async function listPosts(ctx: Ctx, raw: z.input<typeof ListPostsInput> = {}) {
  assertCan(ctx, "posts:read");
  const input = ListPostsInput.parse(raw);
  const now = new Date();
  const where: SQL[] = [eq(posts.workspaceId, ctx.workspaceId), isNull(posts.deletedAt)];
  if (input.status === "draft") where.push(eq(posts.published, false));
  if (input.status === "published")
    where.push(
      eq(posts.published, true),
      sql`${posts.publishedAt} <= ${now.toISOString()}::timestamptz`,
    );
  if (input.status === "scheduled")
    where.push(
      eq(posts.published, true),
      sql`${posts.publishedAt} > ${now.toISOString()}::timestamptz`,
    );
  if (input.locale) {
    where.push(
      exists(
        ctx.db
          .select({ one: sql`1` })
          .from(postTranslations)
          .where(
            and(eq(postTranslations.postId, posts.id), eq(postTranslations.locale, input.locale)),
          ),
      ),
    );
  }
  if (input.missingLocale) {
    where.push(
      sql`not exists (select 1 from ${postTranslations} where ${postTranslations.postId} = ${posts.id} and ${postTranslations.locale} = ${input.missingLocale})`,
    );
  }
  if (input.categoryId) {
    where.push(
      exists(
        ctx.db
          .select({ one: sql`1` })
          .from(postCategories)
          .where(
            and(
              eq(postCategories.postId, posts.id),
              eq(postCategories.categoryId, input.categoryId),
            ),
          ),
      ),
    );
  }
  if (input.q) {
    const like = `%${input.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where.push(
      exists(
        ctx.db
          .select({ one: sql`1` })
          .from(postTranslations)
          .where(
            and(
              eq(postTranslations.postId, posts.id),
              or(ilike(postTranslations.title, like), ilike(postTranslations.text, like)),
            ),
          ),
      ),
    );
  }
  const cursor = input.cursor ? decodeCursor(input.cursor) : null;
  if (cursor) {
    const at = sql`${cursor.at.toISOString()}::timestamptz`;
    where.push(or(sql`${sortKey} < ${at}`, and(sql`${sortKey} = ${at}`, lt(posts.id, cursor.id)))!);
  }
  const rows = await ctx.db
    .select()
    .from(posts)
    .where(and(...where))
    .orderBy(desc(sortKey), desc(posts.id))
    .limit(input.limit + 1);
  const page = rows.slice(0, input.limit);
  const last = page[page.length - 1];
  return {
    items: await hydrate(ctx.db, page),
    nextCursor: rows.length > input.limit && last ? encodeCursor(last) : null,
  };
}

export async function countPostsByStatus(ctx: Ctx) {
  assertCan(ctx, "posts:read");
  const now = new Date();
  const [r] = await ctx.db
    .select({
      all: sql<number>`count(*)::int`,
      draft: sql<number>`count(*) filter (where not ${posts.published})::int`,
      scheduled: sql<number>`count(*) filter (where ${posts.published} and ${posts.publishedAt} > ${now.toISOString()}::timestamptz)::int`,
      published: sql<number>`count(*) filter (where ${posts.published} and ${posts.publishedAt} <= ${now.toISOString()}::timestamptz)::int`,
    })
    .from(posts)
    .where(and(eq(posts.workspaceId, ctx.workspaceId), isNull(posts.deletedAt)));
  return r ?? { all: 0, draft: 0, scheduled: 0, published: 0 };
}

/** Re-renders all posts of a workspace (e.g. after renaming a category). */
export async function rerenderWorkspacePosts(db: DbOrTx, workspaceId: string) {
  const ws = await getWorkspace(db, workspaceId);
  const rows = await db
    .select({ id: posts.id })
    .from(posts)
    .where(eq(posts.workspaceId, workspaceId));
  for (const r of rows) await syncRendered(db, ws, r.id);
}

/* ---------- public, transactional entry points ---------- */

export const createPost = (ctx: Ctx, raw: z.input<typeof CreatePostInput>) =>
  inTx(ctx, (c) => createPostImpl(c, raw));
export const updatePost = (
  ctx: Ctx,
  id: string,
  raw: z.input<typeof UpdatePostInput>,
  opts: { expectedVersion?: number } = {},
) => inTx(ctx, (c) => updatePostImpl(c, id, raw, opts));
export const publishPost = (
  ctx: Ctx,
  id: string,
  opts: { at?: Date | string | null; expectedVersion?: number } = {},
) => inTx(ctx, (c) => publishPostImpl(c, id, opts));
export const unpublishPost = (ctx: Ctx, id: string, opts: { expectedVersion?: number } = {}) =>
  inTx(ctx, (c) => unpublishPostImpl(c, id, opts));
export const deletePost = (ctx: Ctx, id: string, opts: { expectedVersion?: number } = {}) =>
  inTx(ctx, (c) => deletePostImpl(c, id, opts));

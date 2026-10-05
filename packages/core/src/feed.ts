import { type DbOrTx, postCategories, posts, postTranslations, user } from "@featherlog/db";
import { and, desc, eq, exists, inArray, isNull, lt, or, type SQL, sql } from "drizzle-orm";
import { type Category, categoryName, categorySlug, listCategories } from "./categories";
import type { Workspace } from "./workspaces";

/** A post as shown on the public page, RSS and widget (already resolved to one locale). */
export type PublicPost = {
  id: string;
  publicId: string;
  locale: string;
  /** True when shown in the default locale because the requested one is missing. */
  isFallback: boolean;
  title: string;
  slug: string;
  html: string;
  excerpt: string;
  publishedAt: Date;
  categories: { id: string; name: string; slug: string; color: string }[];
  author: { name: string; jobTitle: string | null; image: string | null } | null;
  /** Locales in which this post has a translation. */
  locales: string[];
};

export type FeedOptions = {
  locale: string;
  limit?: number;
  cursor?: string | null;
  categorySlug?: string | null;
  now?: Date;
};

function visible(workspaceId: string, now: Date): SQL[] {
  return [
    eq(posts.workspaceId, workspaceId),
    eq(posts.published, true),
    isNull(posts.deletedAt),
    sql`${posts.publishedAt} <= ${now.toISOString()}::timestamptz`,
  ];
}

function encodeCursor(at: Date, id: string) {
  return Buffer.from(`${at.toISOString()}|${id}`).toString("base64url");
}

function decodeCursor(cursor: string) {
  try {
    const [at, id] = Buffer.from(cursor, "base64url").toString().split("|");
    const date = new Date(at ?? "");
    return id && !Number.isNaN(date.getTime()) ? { at: date, id } : null;
  } catch {
    return null;
  }
}

function resolveLocale(ws: Workspace, locale: string) {
  return ws.locales.includes(locale) ? locale : ws.defaultLocale;
}

async function toPublic(
  db: DbOrTx,
  ws: Workspace,
  rows: (typeof posts.$inferSelect)[],
  locale: string,
  cats: Category[],
): Promise<PublicPost[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [translations, pc, authors] = await Promise.all([
    db.select().from(postTranslations).where(inArray(postTranslations.postId, ids)),
    db.select().from(postCategories).where(inArray(postCategories.postId, ids)),
    ws.showAuthors
      ? db
          .select({
            id: user.id,
            name: user.name,
            displayName: user.displayName,
            jobTitle: user.jobTitle,
            image: user.image,
          })
          .from(user)
          .where(
            inArray(
              user.id,
              rows.map((r) => r.authorId).filter((x): x is string => !!x),
            ),
          )
      : Promise.resolve([]),
  ]);
  const out: PublicPost[] = [];
  for (const r of rows) {
    const mine = translations.filter((t) => t.postId === r.id);
    const t =
      mine.find((x) => x.locale === locale) ??
      mine.find((x) => x.locale === ws.defaultLocale) ??
      mine[0];
    if (!t) continue;
    const a = authors.find((x) => x.id === r.authorId);
    out.push({
      id: r.id,
      publicId: r.publicId,
      locale: t.locale,
      isFallback: t.locale !== locale,
      title: t.title,
      slug: t.slug,
      html: t.contentHtml,
      excerpt: t.excerpt,
      publishedAt: r.publishedAt!,
      categories: pc
        .filter((x) => x.postId === r.id)
        .map((x) => cats.find((c) => c.id === x.categoryId))
        .filter((c): c is Category => !!c)
        .sort((x, y) => x.position - y.position)
        .map((c) => ({
          id: c.id,
          name: categoryName(c, t.locale, ws.defaultLocale),
          slug: categorySlug(c, locale, ws.defaultLocale),
          color: c.color,
        })),
      author: a ? { name: a.displayName || a.name, jobTitle: a.jobTitle, image: a.image } : null,
      locales: mine.map((x) => x.locale),
    });
  }
  return out;
}

/** Visible posts for the public page / widget / RSS, newest first, resolved to `locale`. */
export async function getPublicFeed(db: DbOrTx, ws: Workspace, opts: FeedOptions) {
  const locale = resolveLocale(ws, opts.locale);
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 100);
  const now = opts.now ?? new Date();
  const cats = await listCategories(db, ws.id);
  const where = visible(ws.id, now);

  if (ws.missingTranslation === "hide" && locale !== ws.defaultLocale) {
    where.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(postTranslations)
          .where(and(eq(postTranslations.postId, posts.id), eq(postTranslations.locale, locale))),
      ),
    );
  }
  if (opts.categorySlug) {
    const cat = cats.find((c) => Object.values(c.slugs).includes(opts.categorySlug!));
    if (!cat) return { items: [], nextCursor: null, locale, category: null };
    where.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(postCategories)
          .where(and(eq(postCategories.postId, posts.id), eq(postCategories.categoryId, cat.id))),
      ),
    );
  }
  const cursor = opts.cursor ? decodeCursor(opts.cursor) : null;
  if (cursor) {
    where.push(
      or(
        lt(posts.publishedAt, cursor.at),
        and(eq(posts.publishedAt, cursor.at), lt(posts.id, cursor.id)),
      )!,
    );
  }
  const rows = await db
    .select()
    .from(posts)
    .where(and(...where))
    .orderBy(desc(posts.publishedAt), desc(posts.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const category = opts.categorySlug
    ? (cats.find((c) => Object.values(c.slugs).includes(opts.categorySlug!)) ?? null)
    : null;
  return {
    items: await toPublic(db, ws, page, locale, cats),
    nextCursor: rows.length > limit && last ? encodeCursor(last.publishedAt!, last.id) : null,
    locale,
    category: category
      ? {
          id: category.id,
          name: categoryName(category, locale, ws.defaultLocale),
          color: category.color,
        }
      : null,
  };
}

/** A single visible post by its public id, or null. */
export async function getPublicPost(
  db: DbOrTx,
  ws: Workspace,
  publicId: string,
  locale: string,
  now = new Date(),
) {
  const loc = resolveLocale(ws, locale);
  const [row] = await db
    .select()
    .from(posts)
    .where(and(...visible(ws.id, now), eq(posts.publicId, publicId)));
  if (!row) return null;
  const cats = await listCategories(db, ws.id);
  const [p] = await toPublic(db, ws, [row], loc, cats);
  if (!p) return null;
  if (p.isFallback && ws.missingTranslation === "hide" && loc !== ws.defaultLocale) return null;
  return p;
}

/** Visible post ids + dates — used for sitemaps. */
export async function listVisiblePostRefs(db: DbOrTx, ws: Workspace, now = new Date()) {
  return db
    .select({
      id: posts.id,
      publicId: posts.publicId,
      publishedAt: posts.publishedAt,
      updatedAt: posts.updatedAt,
    })
    .from(posts)
    .where(and(...visible(ws.id, now)))
    .orderBy(desc(posts.publishedAt));
}

/** Public URL path of a post, relative to the workspace root. */
export function publicPostPath(
  ws: Pick<Workspace, "defaultLocale">,
  post: Pick<PublicPost, "slug" | "publicId">,
  locale: string,
) {
  const prefix = locale === ws.defaultLocale ? "" : `/${locale}`;
  return `${prefix}/${post.slug}-${post.publicId}`;
}

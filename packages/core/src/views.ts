import { createHmac, timingSafeEqual } from "node:crypto";
import {
  type DbOrTx,
  newsletterPosts,
  posts,
  postViews,
  subscribers,
  widgetSettings,
} from "@featherlog/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { assertCan, type Ctx } from "./auth";
import { randomToken } from "./crypto";
import { getWidgetSettings } from "./widget";

export type ViewSource = "widget" | "email";

/** `hex(HMAC-SHA256(secret, userId))`: what the host app signs so the widget can't be spoofed. */
export function widgetUserHash(secret: string, userId: string) {
  return createHmac("sha256", secret).update(userId).digest("hex");
}

export function verifyWidgetUser(secret: string, userId: string, hash: string) {
  if (!userId || userId.length > 200 || !/^[0-9a-f]{64}$/i.test(hash)) return false;
  const expected = Buffer.from(widgetUserHash(secret, userId));
  const given = Buffer.from(hash.toLowerCase());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Turns identified widget users on (new secret) or off. Rotating invalidates every hash. */
export async function setWidgetIdentity(ctx: Ctx, mode: "enable" | "rotate" | "disable") {
  assertCan(ctx, "settings:write");
  const current = await getWidgetSettings(ctx.db, ctx.workspaceId);
  const identitySecret =
    mode === "disable"
      ? null
      : mode === "enable" && current.identitySecret
        ? current.identitySecret
        : `fl_wid_${randomToken(24)}`;
  const [row] = await ctx.db
    .update(widgetSettings)
    .set({ identitySecret, updatedAt: new Date() })
    .where(eq(widgetSettings.workspaceId, ctx.workspaceId))
    .returning();
  return row!;
}

export async function findSubscriberByExternalId(
  db: DbOrTx,
  workspaceId: string,
  externalId: string,
) {
  const [row] = await db
    .select()
    .from(subscribers)
    .where(and(eq(subscribers.workspaceId, workspaceId), eq(subscribers.externalId, externalId)));
  return row ?? null;
}

/** Records that a subscriber saw these posts. Ignores ids of other workspaces and repeats. */
export async function recordPostViews(
  db: DbOrTx,
  workspaceId: string,
  subscriberId: string,
  postIds: string[],
  source: ViewSource,
) {
  const ids = [...new Set(postIds)].slice(0, 200);
  if (ids.length === 0) return 0;
  const valid = await db
    .select({ id: posts.id })
    .from(posts)
    .where(
      and(eq(posts.workspaceId, workspaceId), inArray(posts.id, ids), isNull(posts.deletedAt)),
    );
  if (valid.length === 0) return 0;
  const inserted = await db
    .insert(postViews)
    .values(valid.map((p) => ({ postId: p.id, subscriberId, workspaceId, source })))
    .onConflictDoNothing()
    .returning({ postId: postViews.postId });
  return inserted.length;
}

export async function seenPostIds(db: DbOrTx, workspaceId: string, subscriberId: string) {
  const rows = await db
    .select({ postId: postViews.postId })
    .from(postViews)
    .where(and(eq(postViews.workspaceId, workspaceId), eq(postViews.subscriberId, subscriberId)));
  return rows.map((r) => r.postId);
}

/** Per post of a newsletter: how many subscribers saw it, in the widget and from the email. */
export async function newsletterReadStats(ctx: Ctx, newsletterId: string) {
  assertCan(ctx, "newsletters:read");
  const rows = await ctx.db
    .select({
      postId: newsletterPosts.postId,
      widget: sql<number>`count(${postViews.subscriberId}) filter (where ${postViews.source} = 'widget')::int`,
      email: sql<number>`count(${postViews.subscriberId}) filter (where ${postViews.source} = 'email')::int`,
    })
    .from(newsletterPosts)
    .leftJoin(postViews, eq(postViews.postId, newsletterPosts.postId))
    .where(eq(newsletterPosts.newsletterId, newsletterId))
    .groupBy(newsletterPosts.postId);
  const [unique] = await ctx.db
    .select({ n: sql<number>`count(distinct ${postViews.subscriberId})::int` })
    .from(postViews)
    .innerJoin(newsletterPosts, eq(newsletterPosts.postId, postViews.postId))
    .where(and(eq(newsletterPosts.newsletterId, newsletterId), eq(postViews.source, "email")));
  return {
    posts: Object.fromEntries(rows.map((r) => [r.postId, { widget: r.widget, email: r.email }])),
    emailReaders: unique?.n ?? 0,
  };
}

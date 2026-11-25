import { findWorkspaceByPublicId, recordPostViews } from "@featherlog/core";
import { posts, postTranslations, subscribers } from "@featherlog/db";
import { and, eq, isNull } from "drizzle-orm";
import { verifyClickToken } from "@/lib/click-tokens";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { listUrl, postUrl } from "@/lib/public-urls";

export const dynamic = "force-dynamic";

/**
 * GET /api/nl/:account/:token/:postPublicId — a "read more" link in a newsletter. Records that
 * the subscriber read the post (source `email`) and redirects to it in their language.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ account: string; token: string; post: string }> },
) {
  const { account, token, post: postPublicId } = await params;
  const ws = await findWorkspaceByPublicId(db, account).catch(() => null);
  if (!ws) return new Response("Not found", { status: 404 });
  const [post] = await db
    .select()
    .from(posts)
    .where(
      and(eq(posts.workspaceId, ws.id), eq(posts.publicId, postPublicId), isNull(posts.deletedAt)),
    );
  if (!post) return Response.redirect(listUrl(ws), 302);

  const subscriberId = verifyClickToken(ws.id, token);
  let locale = ws.defaultLocale;
  if (subscriberId) {
    const [sub] = await db
      .select({ id: subscribers.id, locale: subscribers.locale })
      .from(subscribers)
      .where(and(eq(subscribers.id, subscriberId), eq(subscribers.workspaceId, ws.id)));
    if (sub) {
      locale = sub.locale ?? locale;
      await recordPostViews(db, ws.id, sub.id, [post.id], "email").catch((err) =>
        logger.warn({ err }, "could not record newsletter click"),
      );
    }
  }
  const trs = await db.select().from(postTranslations).where(eq(postTranslations.postId, post.id));
  const tr =
    trs.find((t) => t.locale === locale) ??
    trs.find((t) => t.locale === ws.defaultLocale) ??
    trs[0];
  if (!tr) return Response.redirect(listUrl(ws), 302);
  return new Response(null, {
    status: 302,
    headers: {
      Location: postUrl(ws, { slug: tr.slug, publicId: post.publicId }, tr.locale),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

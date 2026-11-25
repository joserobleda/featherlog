import {
  findSubscriberByExternalId,
  findWorkspaceByPublicId,
  getWidgetSettings,
  recordPostViews,
  seenPostIds,
  verifyWidgetUser,
} from "@featherlog/core";
import { z } from "zod";
import { db } from "@/lib/db";
import { memoryRateLimiter } from "@/server/api/rate-limit";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

const Body = z.object({
  user: z.string().min(1).max(200),
  hash: z.string().max(128),
  ids: z.array(z.string().max(40)).max(200).optional(),
});

const limiter = memoryRateLimiter(120, 60_000);

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: CORS });

/**
 * POST /api/widget/:account/seen — identified widget users. Body (sent as text/plain to skip
 * the CORS preflight): `{ user, hash, ids? }`. Records `ids` as seen and answers with every post
 * this person has seen, in the widget or from a newsletter, so the badge agrees across devices.
 */
export async function POST(req: Request, { params }: { params: Promise<{ account: string }> }) {
  const { account } = await params;
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(JSON.parse(await req.text()));
  } catch {
    return json({ error: { code: "validation", message: "Invalid body" } }, 422);
  }
  if (!limiter.hit(`${account}:${body.user}`).allowed)
    return json({ error: { code: "rate_limited", message: "Too many requests" } }, 429);
  const ws = await findWorkspaceByPublicId(db, account).catch(() => null);
  if (!ws) return json({ error: { code: "not_found", message: "Unknown widget account" } }, 404);
  const settings = await getWidgetSettings(db, ws.id);
  if (!settings.identitySecret || !verifyWidgetUser(settings.identitySecret, body.user, body.hash))
    return json({ error: { code: "unauthorized", message: "Invalid user signature" } }, 401);
  const subscriber = await findSubscriberByExternalId(db, ws.id, body.user);
  if (!subscriber) return json({ seen: [] });
  if (body.ids?.length) await recordPostViews(db, ws.id, subscriber.id, body.ids, "widget");
  return json({ seen: await seenPostIds(db, ws.id, subscriber.id) });
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { ...CORS, "Access-Control-Max-Age": "86400" },
  });
}

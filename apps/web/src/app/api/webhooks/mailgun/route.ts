import { applyEmailFeedback } from "@featherlog/core";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { feedbackFromMailgunEvent, verifyMailgunSignature } from "@/server/newsletters/mailgun";

export const dynamic = "force-dynamic";

const seenTokens = new Map<string, number>();

/**
 * POST /api/webhooks/mailgun — bounces, complaints and unsubscribes from Mailgun.
 * Needs MAILGUN_WEBHOOK_SIGNING_KEY. Answers 406 to bad signatures (Mailgun stops retrying)
 * and 200 to events it ignores.
 */
export async function POST(req: Request) {
  const key = env.MAILGUN_WEBHOOK_SIGNING_KEY;
  if (!key) return new Response("Not found", { status: 404 });
  let body: { signature?: Record<string, unknown>; "event-data"?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (!verifyMailgunSignature(key, body.signature)) {
    logger.warn("mailgun webhook with an invalid signature");
    return new Response("Invalid signature", { status: 406 });
  }
  // Replays of the same signed request within its 15-minute window are ignored.
  const token = String(body.signature?.token);
  const now = Date.now();
  for (const [t, at] of seenTokens) if (now - at > 20 * 60_000) seenTokens.delete(t);
  if (seenTokens.has(token)) return new Response("Duplicate", { status: 200 });
  seenTokens.set(token, now);

  const feedback = feedbackFromMailgunEvent(body["event-data"]);
  if (!feedback) return new Response("Ignored", { status: 200 });
  const result = await applyEmailFeedback(db, feedback);
  logger.info(
    { kind: feedback.kind, subscriberId: feedback.subscriberId, applied: Boolean(result) },
    "mailgun feedback",
  );
  return new Response("OK", { status: 200 });
}

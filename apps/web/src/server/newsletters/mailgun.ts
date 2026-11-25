import { createHmac, timingSafeEqual } from "node:crypto";
import type { EmailFeedback } from "@featherlog/core";

/**
 * Mailgun webhooks (Sending → Webhooks): permanent failures, spam complaints and Mailgun's own
 * unsubscribes come back to Featherlog. Each newsletter email carries `X-Mailgun-Variables`
 * with the workspace, subscriber and newsletter ids, which Mailgun echoes as `user-variables`.
 */
export const MAILGUN_VARIABLES_HEADER = "X-Mailgun-Variables";

export function mailgunVariables(ids: {
  workspaceId: string;
  subscriberId: string;
  newsletterId: string;
}) {
  return JSON.stringify({
    fl_ws: ids.workspaceId,
    fl_sub: ids.subscriberId,
    fl_nl: ids.newsletterId,
  });
}

type Signature = { timestamp?: unknown; token?: unknown; signature?: unknown };

/** `hex(HMAC-SHA256(signing key, timestamp + token))`, at most 15 minutes old. */
export function verifyMailgunSignature(key: string, sig: Signature | undefined, now = Date.now()) {
  if (!sig || typeof sig !== "object") return false;
  const { timestamp, token, signature } = sig;
  if (typeof timestamp !== "string" || typeof token !== "string" || typeof signature !== "string")
    return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 15 * 60) return false;
  const expected = Buffer.from(
    createHmac("sha256", key)
      .update(timestamp + token)
      .digest("hex"),
  );
  const given = Buffer.from(signature.toLowerCase());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

type EventData = {
  event?: unknown;
  severity?: unknown;
  reason?: unknown;
  "user-variables"?: Record<string, unknown>;
  "delivery-status"?: { code?: unknown; message?: unknown; description?: unknown };
};

/** What to apply for a Mailgun event, or null when it is not about a newsletter subscriber. */
export function feedbackFromMailgunEvent(data: EventData | undefined): {
  workspaceId: string;
  subscriberId: string;
  newsletterId: string | null;
  kind: EmailFeedback;
  reason: string;
} | null {
  if (!data || typeof data !== "object") return null;
  const vars = data["user-variables"] ?? {};
  const workspaceId = typeof vars.fl_ws === "string" ? vars.fl_ws : null;
  const subscriberId = typeof vars.fl_sub === "string" ? vars.fl_sub : null;
  if (!workspaceId || !subscriberId) return null;
  const newsletterId = typeof vars.fl_nl === "string" ? vars.fl_nl : null;
  let kind: EmailFeedback | null = null;
  if (data.event === "failed" && data.severity === "permanent") kind = "bounced";
  else if (data.event === "complained") kind = "complained";
  else if (data.event === "unsubscribed") kind = "unsubscribed";
  if (!kind) return null;
  const status = data["delivery-status"] ?? {};
  const reason = [status.code, status.description || status.message || data.reason]
    .filter((x) => x !== undefined && x !== null && x !== "")
    .join(" ")
    .slice(0, 500);
  return { workspaceId, subscriberId, newsletterId, kind, reason: reason || String(data.event) };
}

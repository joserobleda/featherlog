import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";
import { appUrl } from "./urls";

/**
 * Unsubscribe links in newsletter emails: `<subscriberId>.<sig>` with
 * `sig = base64url(HMAC-SHA256(AUTH_SECRET, "fl-unsub:<workspaceId>:<subscriberId>"))`.
 * They never expire: an old email must still let the person opt out.
 */
function sign(workspaceId: string, subscriberId: string) {
  return createHmac("sha256", env.AUTH_SECRET)
    .update(`fl-unsub:${workspaceId}:${subscriberId}`)
    .digest("base64url");
}

export function unsubscribeToken(workspaceId: string, subscriberId: string) {
  return `${subscriberId}.${sign(workspaceId, subscriberId)}`;
}

/** Returns the subscriber id, or null when the token is not valid for this workspace. */
export function verifyUnsubscribeToken(workspaceId: string, token: string | null | undefined) {
  if (!token || token.length > 200) return null;
  const [subscriberId, sig, ...rest] = token.split(".");
  if (!subscriberId || !sig || rest.length > 0 || !/^[0-9a-z]{1,40}$/.test(subscriberId))
    return null;
  const expected = Buffer.from(sign(workspaceId, subscriberId));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? subscriberId : null;
}

/** Page where the person confirms (link scanners don't unsubscribe anyone by visiting it). */
export function unsubscribePageUrl(publicId: string, token: string) {
  return appUrl(`/unsubscribe/${publicId}/${token}`);
}

/** RFC 8058 one-click endpoint for the `List-Unsubscribe` header (POST only). */
export function unsubscribeOneClickUrl(publicId: string, token: string) {
  return appUrl(`/api/unsubscribe/${publicId}/${token}`);
}

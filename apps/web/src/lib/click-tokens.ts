import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";
import { appUrl } from "./urls";

/**
 * Tracked "read more" links in newsletters: `/api/nl/<account>/<subscriberId>.<sig>/<postPublicId>`
 * with `sig = base64url(HMAC-SHA256(AUTH_SECRET, "fl-click:<workspaceId>:<subscriberId>"))`.
 * The redirect target is always the post's own public URL, so the link can't be abused as an
 * open redirect.
 */
function sign(workspaceId: string, subscriberId: string) {
  return createHmac("sha256", env.AUTH_SECRET)
    .update(`fl-click:${workspaceId}:${subscriberId}`)
    .digest("base64url");
}

export function clickToken(workspaceId: string, subscriberId: string) {
  return `${subscriberId}.${sign(workspaceId, subscriberId)}`;
}

export function verifyClickToken(workspaceId: string, token: string) {
  if (token.length > 200) return null;
  const [subscriberId, sig, ...rest] = token.split(".");
  if (!subscriberId || !sig || rest.length > 0 || !/^[0-9a-z]{1,40}$/.test(subscriberId))
    return null;
  const expected = Buffer.from(sign(workspaceId, subscriberId));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? subscriberId : null;
}

export function trackedPostUrl(publicId: string, token: string, postPublicId: string) {
  return appUrl(`/api/nl/${publicId}/${token}/${postPublicId}`);
}

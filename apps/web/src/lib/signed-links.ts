import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/**
 * Signed access tokens for private-mode public changelogs.
 *
 * Format: `<exp>.<sig>` where `exp` is a unix timestamp (seconds, base36) and
 * `sig = base64url(HMAC-SHA256(AUTH_SECRET, "fl-public:<workspaceId>:<exp>"))`.
 *
 * `exp` is rounded up to the next 5-minute boundary so tokens are stable for a while,
 * which keeps cached widget responses / ETags stable.
 */
const ROUND_SEC = 300;

function sign(workspaceId: string, exp: string) {
  return createHmac("sha256", env.AUTH_SECRET)
    .update(`fl-public:${workspaceId}:${exp}`)
    .digest("base64url");
}

export function signPublicToken(workspaceId: string, expiresInSec = 3600, now = Date.now()) {
  const exp = Math.ceil((Math.floor(now / 1000) + expiresInSec) / ROUND_SEC) * ROUND_SEC;
  const e = exp.toString(36);
  return `${e}.${sign(workspaceId, e)}`;
}

export function verifyPublicToken(
  workspaceId: string,
  token: string | null | undefined,
  now = Date.now(),
) {
  if (!token || token.length > 200) return false;
  const [e, sig, ...rest] = token.split(".");
  if (!e || !sig || rest.length > 0 || !/^[0-9a-z]{1,12}$/.test(e)) return false;
  const exp = Number.parseInt(e, 36);
  if (!Number.isFinite(exp) || exp * 1000 < now) return false;
  const expected = Buffer.from(sign(workspaceId, e));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Name of the cookie the proxy sets when a `?t=` token is present on a public page. */
export function publicTokenCookie(slug: string) {
  return `fl_pt_${slug.replace(/[^a-z0-9-]/gi, "")}`;
}

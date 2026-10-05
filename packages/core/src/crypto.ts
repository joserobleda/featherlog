import { createHash, randomBytes } from "node:crypto";

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export function randomToken(length = 32) {
  const bytes = randomBytes(length);
  let out = "";
  for (const b of bytes) out += BASE62[b % 62];
  return out;
}

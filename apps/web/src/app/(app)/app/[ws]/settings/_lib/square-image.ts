import "server-only";
import { nanoid } from "nanoid";
import sharp from "sharp";
import { storage } from "@/lib/storage";

export const SQUARE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
// SVG is deliberately excluded (it can carry scripts).
const ACCEPTED_FORMATS = new Set(["png", "jpeg", "webp", "gif"]);

export type ImageErrorCode = "missing" | "type" | "size" | "invalid";

export class ImageError extends Error {
  constructor(readonly code: ImageErrorCode) {
    super(code);
  }
}

/**
 * Validates an uploaded logo/avatar (PNG, JPEG, WebP or GIF up to 2 MB), resizes it to a
 * `size`×`size` WebP and stores it under `<prefix>/<nanoid>.webp`. Returns the public URL.
 */
export async function storeSquareImage(
  file: FormDataEntryValue | null,
  prefix: string,
  opts: { size?: number; fit?: "cover" | "contain" } = {},
) {
  if (!(file instanceof File) || file.size === 0) throw new ImageError("missing");
  if (!ACCEPTED_MIME.has(file.type)) throw new ImageError("type");
  if (file.size > SQUARE_IMAGE_MAX_BYTES) throw new ImageError("size");
  const input = Buffer.from(await file.arrayBuffer());
  const size = opts.size ?? 256;
  let body: Buffer;
  try {
    const meta = await sharp(input).metadata();
    if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) throw new ImageError("type");
    body = await sharp(input)
      .rotate()
      .resize(size, size, {
        fit: opts.fit ?? "cover",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        withoutEnlargement: false,
      })
      .webp({ quality: 88 })
      .toBuffer();
  } catch (err) {
    if (err instanceof ImageError) throw err;
    throw new ImageError("invalid");
  }
  const key = `${prefix}/${nanoid(16)}.webp`;
  await storage.put(key, body, "image/webp");
  return storage.url(key);
}

/** Deletes a previously stored image if `url` points inside `prefix` (best effort). */
export async function deleteStoredImage(url: string | null | undefined, prefix: string) {
  if (!url) return;
  const base = storage.url(`${prefix}/x`).slice(0, -1);
  if (!url.startsWith(base)) return;
  const name = url.slice(base.length);
  if (!/^[\w-]+\.webp$/.test(name)) return;
  await storage.delete(`${prefix}/${name}`).catch(() => {});
}

/** Rejects cross-site requests to upload route handlers (Server Actions get this for free). */
export function isSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

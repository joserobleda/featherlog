import { type Ctx, createAsset } from "@featherlog/core";
import { nanoid } from "nanoid";
import sharp from "sharp";
import { storage } from "@/lib/storage";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPTED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);

export class UploadError extends Error {}

/**
 * Validates and normalizes an uploaded image: animated GIFs are kept as-is, everything else is
 * converted to WebP (max `maxWidth` px wide, EXIF stripped). Returns the stored asset.
 */
export async function storeImage(
  ctx: Ctx,
  input: { bytes: Buffer; mime: string; folder: string },
  opts: { maxWidth?: number; square?: number } = {},
) {
  if (!ACCEPTED.has(input.mime))
    throw new UploadError("Unsupported image type. Use PNG, JPEG, WebP, GIF or AVIF.");
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES)
    throw new UploadError("Image is larger than 10 MB.");

  let body: Buffer;
  let mime: string;
  let ext: string;
  let width: number | undefined;
  let height: number | undefined;
  try {
    // Reading metadata decodes no pixels, so the pixel limit (which long animated GIFs exceed) is lifted here.
    const meta = await sharp(input.bytes, { animated: true, limitInputPixels: false }).metadata();
    if (input.mime === "image/gif" && (meta.pages ?? 1) > 1 && !opts.square) {
      body = input.bytes;
      mime = "image/gif";
      ext = "gif";
      width = meta.width;
      height = meta.pageHeight ?? meta.height;
    } else {
      let pipeline = sharp(input.bytes).rotate();
      pipeline = opts.square
        ? pipeline.resize(opts.square, opts.square, { fit: "cover" })
        : pipeline.resize({ width: opts.maxWidth ?? 2000, withoutEnlargement: true });
      const out = await pipeline.webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
      body = out.data;
      mime = "image/webp";
      ext = "webp";
      width = out.info.width;
      height = out.info.height;
    }
  } catch {
    throw new UploadError("This file doesn't look like a valid image.");
  }
  const key = `${input.folder}/${ctx.workspaceId}/${nanoid(16)}.${ext}`;
  await storage.put(key, body, mime);
  const asset = await createAsset(ctx, {
    storageKey: key,
    mime,
    size: body.byteLength,
    width,
    height,
  });
  return { ...asset, url: storage.url(key) };
}

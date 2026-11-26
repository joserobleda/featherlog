import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { storage } from "@/lib/storage";
import { emailCopy, needsEmailCopy } from "@/server/media";

const id = Math.random().toString(36).slice(2);
const keys = ["logo.webp", "logo.webp.png", "shot.webp", "shot.webp.jpg"].map(
  (k) => `test/${id}/${k}`,
);
afterAll(() => Promise.all(keys.map((k) => storage.delete(k))));

describe("email-safe image copies", () => {
  it("turns transparent WebP into PNG and opaque WebP into JPEG, once", async () => {
    const make = (alpha: number) =>
      sharp({
        create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 0, b: 255, alpha } },
      })
        .webp()
        .toBuffer();
    await storage.put(`test/${id}/logo.webp`, await make(0.5), "image/webp");
    await storage.put(`test/${id}/shot.webp`, await make(1), "image/webp");

    const logo = await emailCopy(`test/${id}/logo.webp`);
    expect(logo?.key).toBe(`test/${id}/logo.webp.png`);
    expect((await sharp(logo!.body).metadata()).format).toBe("png");
    const shot = await emailCopy(`test/${id}/shot.webp`);
    expect(shot?.key).toBe(`test/${id}/shot.webp.jpg`);
    expect((await sharp(shot!.body).metadata()).format).toBe("jpeg");
    // Second request reuses the stored copy.
    expect((await emailCopy(`test/${id}/shot.webp`))?.key).toBe(shot!.key);

    expect(await emailCopy(`test/${id}/missing.webp`)).toBeNull();
    expect(needsEmailCopy("a/b.webp")).toBe(true);
    expect(needsEmailCopy("a/b.gif")).toBe(false);
  });
});

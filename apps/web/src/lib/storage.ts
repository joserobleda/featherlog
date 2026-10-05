import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "./env";

export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: Buffer; contentType?: string } | null>;
  delete(key: string): Promise<void>;
  /** Public URL where the file is served. */
  url(key: string): string;
}

const safeKey = (key: string) => {
  const normalized = path.posix.normalize(key).replace(/^(\.\.(\/|$))+/, "");
  if (normalized.startsWith("/") || normalized.includes("..")) throw new Error("Invalid storage key");
  return normalized;
};

class LocalStorage implements Storage {
  private root = path.resolve(env.UPLOADS_DIR);
  async put(key: string, body: Buffer) {
    const file = path.join(this.root, safeKey(key));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }
  async get(key: string) {
    try {
      return { body: await readFile(path.join(this.root, safeKey(key))) };
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    await unlink(path.join(this.root, safeKey(key))).catch(() => {});
  }
  url(key: string) {
    return `${env.APP_URL}/uploads/${safeKey(key)}`;
  }
}

class S3Storage implements Storage {
  private client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: Boolean(env.S3_ENDPOINT),
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! },
  });
  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: safeKey(key),
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }
  async get(key: string) {
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: safeKey(key) }));
      const bytes = await r.Body?.transformToByteArray();
      return bytes ? { body: Buffer.from(bytes), contentType: r.ContentType } : null;
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: safeKey(key) }));
  }
  url(key: string) {
    // Without a public bucket URL, files are proxied through the app.
    return env.S3_PUBLIC_URL ? `${env.S3_PUBLIC_URL.replace(/\/+$/, "")}/${safeKey(key)}` : `${env.APP_URL}/uploads/${safeKey(key)}`;
  }
}

export const storage: Storage = env.STORAGE_DRIVER === "s3" ? new S3Storage() : new LocalStorage();

import { storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  mp4: "video/mp4",
  webm: "video/webm",
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
};

const notFound = () =>
  new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain", "X-Content-Type-Options": "nosniff" },
  });

export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await params;
  let key: string;
  let file: Awaited<ReturnType<typeof storage.get>>;
  try {
    key = parts.map((p) => decodeURIComponent(p)).join("/");
    if (!key || key.includes("..") || key.includes("\0")) return notFound();
    file = await storage.get(key);
  } catch {
    return notFound();
  }
  if (!file) return notFound();
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  const type = TYPES[ext] ?? file.contentType ?? "application/octet-stream";
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Content-Length": String(file.body.length),
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  };
  // SVGs can carry scripts: neutralize them when opened directly.
  if (ext === "svg")
    headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  return new Response(new Uint8Array(file.body), { headers });
}

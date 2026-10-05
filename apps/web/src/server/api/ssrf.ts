import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivate(ip: string) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    return (
      v === "::1" ||
      v === "::" ||
      v.startsWith("fc") ||
      v.startsWith("fd") ||
      v.startsWith("fe80") ||
      v.startsWith("::ffff:127.") ||
      v.startsWith("::ffff:10.") ||
      v.startsWith("::ffff:192.168.")
    );
  }
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

/** Downloads a public http(s) URL with size/time limits, refusing private network targets. */
export async function fetchPublicUrl(raw: string, maxBytes: number) {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("Only http(s) URLs are allowed");
  const addresses = await lookup(url.hostname, { all: true });
  if (addresses.length === 0 || addresses.some((a) => isPrivate(a.address))) {
    throw new Error("This URL points to a private network address");
  }
  const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10_000) });
  if (!res.ok || !res.body) throw new Error(`Download failed with status ${res.status}`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error("File is too large");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > maxBytes) throw new Error("File is too large");
    chunks.push(chunk);
  }
  return {
    bytes: Buffer.concat(chunks),
    mime: (res.headers.get("content-type") ?? "").split(";")[0]!.trim(),
    name: url.pathname.split("/").pop() || "image",
  };
}

import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

/** Address ranges an import-from-URL request must never reach. */
const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["64:ff9b::", 96],
  ["2001:db8::", 32],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

export function isBlockedAddress(ip: string) {
  const family = isIP(ip);
  if (family === 4) return blocked.check(ip, "ipv4");
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (mapped) return blocked.check(mapped[1]!, "ipv4");
    return blocked.check(ip, "ipv6");
  }
  return true;
}

/**
 * The connection itself re-checks the resolved address, so DNS rebinding between our check and
 * the actual connect cannot reach private networks.
 */
const safeAgent = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      lookup(hostname, { all: true })
        .then((addrs) => {
          const ok = addrs.find((a) => !isBlockedAddress(a.address));
          if (!ok || addrs.some((a) => isBlockedAddress(a.address))) {
            callback(new Error("This URL points to a private network address"), "", 4);
            return;
          }
          if ((options as { all?: boolean }).all) callback(null, [ok] as never, ok.family);
          else callback(null, ok.address, ok.family);
        })
        .catch((err) => callback(err, "", 4));
    },
  },
});

/** Downloads a public http(s) URL with size/time limits, refusing private network targets. */
export async function fetchPublicUrl(raw: string, maxBytes: number) {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("Only http(s) URLs are allowed");
  if (
    isIP(url.hostname.replace(/^\[|\]$/g, "")) &&
    isBlockedAddress(url.hostname.replace(/^\[|\]$/g, ""))
  ) {
    throw new Error("This URL points to a private network address");
  }
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost")) {
    throw new Error("This URL points to a private network address");
  }
  const res = await undiciFetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    dispatcher: safeAgent,
  });
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

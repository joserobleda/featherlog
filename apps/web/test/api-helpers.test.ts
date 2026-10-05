import { describe, expect, it } from "vitest";
import { memoryRateLimiter } from "../src/server/api/rate-limit";
import { etagOf, expectedVersionFrom } from "../src/server/api/serializers";
import { fetchPublicUrl, isBlockedAddress } from "../src/server/api/ssrf";

describe("ETag helpers", () => {
  it("round-trips post versions through ETag / If-Match", () => {
    const etag = etagOf({ id: "abc", version: 7 });
    expect(etag).toBe('W/"abc-v7"');
    expect(expectedVersionFrom(etag)).toBe(7);
    expect(expectedVersionFrom('"3"')).toBe(3);
    expect(expectedVersionFrom(undefined)).toBeUndefined();
    expect(expectedVersionFrom("garbage")).toBeUndefined();
  });
});

describe("rate limiter", () => {
  it("allows up to the limit per window", () => {
    const rl = memoryRateLimiter(2, 60_000);
    expect(rl.hit("k").allowed).toBe(true);
    expect(rl.hit("k").remaining).toBe(0);
    expect(rl.hit("k").allowed).toBe(false);
    expect(rl.hit("other").allowed).toBe(true);
  });
});

describe("SSRF guard", () => {
  it.each([
    "http://127.0.0.1/x.png",
    "http://localhost/x.png",
    "http://10.0.0.5/a",
    "http://169.254.169.254/latest",
    "file:///etc/passwd",
  ])("refuses %s", async (url) => {
    await expect(fetchPublicUrl(url, 1024)).rejects.toThrow();
  });
});

describe("blocked address ranges", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.20.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:172.16.0.1",
    "::ffff:169.254.169.254",
    "64:ff9b::a00:1",
  ])("blocks %s", (ip) => expect(isBlockedAddress(ip)).toBe(true));
  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])("allows %s", (ip) =>
    expect(isBlockedAddress(ip)).toBe(false),
  );
});

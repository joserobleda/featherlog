import { describe, expect, it } from "vitest";
import { memoryRateLimiter } from "../src/server/api/rate-limit";
import { etagOf, expectedVersionFrom } from "../src/server/api/serializers";
import { fetchPublicUrl } from "../src/server/api/ssrf";

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

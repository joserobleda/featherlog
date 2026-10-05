import { describe, expect, it } from "vitest";
import { makeExcerpt } from "../src";

describe("makeExcerpt", () => {
  it("returns short text unchanged", () => {
    expect(makeExcerpt("Hello world")).toBe("Hello world");
  });

  it("collapses whitespace", () => {
    expect(makeExcerpt("  a \n\n b\t c ")).toBe("a b c");
  });

  it("defaults to 160 characters", () => {
    const out = makeExcerpt("abcd ".repeat(50));
    expect(out.length).toBeLessThanOrEqual(161);
    expect(out).toMatch(/abcd…$/);
  });

  it("cuts on a word boundary", () => {
    expect(makeExcerpt("The quick brown fox jumps", 12)).toBe("The quick…");
  });

  it("keeps a word that ends exactly at the limit", () => {
    expect(makeExcerpt("The quick brown fox", 9)).toBe("The quick…");
  });

  it("strips trailing punctuation before the ellipsis", () => {
    expect(makeExcerpt("Hello, world and more", 7)).toBe("Hello…");
  });

  it("hard-cuts a single long word", () => {
    expect(makeExcerpt("abcdefghijklmnop", 5)).toBe("abcde…");
  });
});

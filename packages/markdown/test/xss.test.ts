import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src";
import { html } from "./helpers";

/** Attribute names present in the HTML (quoted values blanked out first). */
function attrNames(out: string): string[] {
  const bare = out.replace(/"[^"]*"/g, '""');
  return [...bare.matchAll(/\s([a-z-]+)=/gi)].map((m) => (m[1] ?? "").toLowerCase());
}

/** Asserts the output has no executable/dangerous constructs. */
function expectSafe(out: string) {
  expect(out).not.toMatch(/<script/i);
  expect(out).not.toMatch(/<svg/i);
  expect(out).not.toMatch(/<style/i);
  expect(out).not.toMatch(/<object|<embed|<form|<input(?![^>]*type="checkbox")/i);
  expect(attrNames(out).filter((n) => n.startsWith("on"))).toEqual([]);
  expect(out).not.toMatch(/(?:href|src|action|xlink:href)="\s*(?:javascript|vbscript|data):/i);
}

describe("XSS: raw HTML", () => {
  it.each([
    "<script>alert(1)</script>",
    "text <script>alert(1)</script> text",
    '<img src="x" onerror="alert(1)">',
    "inline <img src=x onerror=alert(1)> here",
    '<svg onload="alert(1)"><circle /></svg>',
    "<style>body{display:none}</style>",
    '<div style="background:url(javascript:alert(1))">x</div>',
    '<a href="javascript:alert(1)">click</a>',
    '<object data="x.swf"></object><embed src="x">',
    '<form action="https://evil.test"><input name="p"></form>',
    '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
    "<details open ontoggle=alert(1)>",
  ])("neutralizes %s", async (md) => {
    expectSafe(await html(md));
  });

  it("drops iframes from raw HTML", async () => {
    const out = await html('<iframe src="https://evil.test"></iframe>\n\nok');
    expect(out).not.toContain("iframe");
    expect(out).toContain("<p>ok</p>");
  });

  it("does not allow raw iframes to masquerade as embeds", async () => {
    const out = await html(
      '<div class="fl-video" data-fl-key="x"><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"></iframe></div>',
    );
    expect(out).not.toContain("iframe");
    expect(out).not.toContain("fl-video");
  });

  it("keeps text of stripped inline tags", async () => {
    expect(await html("a <b>bold</b> c")).toBe("<p>a bold c</p>");
  });
});

describe("XSS: dangerous URLs", () => {
  it.each([
    "[x](javascript:alert(1))",
    "[x](JaVaScRiPt:alert(1))",
    "[x]( javascript:alert(1))",
    "[x](<javascript:alert(1)>)",
    "[x](java\tscript:alert(1))",
    "[x](&#106;avascript:alert(1))",
    "[x](&#x6A;&#x61;vascript:alert(1))",
    "[x](javascript&colon;alert(1))",
    "[x](%6Aavascript:alert(1))",
    "[x](vbscript:msgbox(1))",
    "[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
    "<javascript:alert(1)>",
  ])("neutralizes link %s", async (md) => {
    expectSafe(await html(md));
  });

  it("neutralizes javascript: in reference definitions", async () => {
    const out = await html("[click][evil]\n\n[evil]: javascript:alert(1)");
    expectSafe(out);
    expect(out).not.toMatch(/href=/);
  });

  it("neutralizes javascript: in image reference definitions", async () => {
    expectSafe(await html("![x][evil]\n\n[evil]: javascript:alert(1)"));
  });

  it.each([
    "![x](javascript:alert(1))",
    "![x](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)",
    "![x](data:image/png;base64,iVBORw0KGgo=)",
    "![x](mailto:a@b.co)",
  ])("drops images with disallowed protocols: %s", async (md) => {
    const out = await html(md);
    expectSafe(out);
    expect(out).not.toContain("<img");
  });

  it("does not embed javascript: lookalike video URLs", async () => {
    const out = await html("javascript:alert(1)//youtu.be/dQw4w9WgXcQ");
    expect(out).not.toContain("iframe");
    expectSafe(out);
  });
});

describe("XSS: attribute breakout", () => {
  it("escapes quotes in alt and title", async () => {
    const out = await html(
      '![a" onerror="alert(1)](https://x.test/a.png "t\\" onload=\\"alert(1)")',
    );
    expect(attrNames(out)).not.toContain("onerror");
    expect(attrNames(out)).not.toContain("onload");
    expect(out).toContain("&#x22;");
  });

  it("escapes quotes in link titles", async () => {
    const out = await html('[x](https://x.test "a\\" onmouseover=\\"alert(1)")');
    expect(attrNames(out)).not.toContain("onmouseover");
  });

  it("escapes quotes in sized image titles", async () => {
    const out = await html(`![a](a.png 'x" onerror="alert(1)' =10x10)`);
    expect(attrNames(out)).not.toContain("onerror");
    expect(out).toContain('width="10"');
  });

  it("escapes video titles from alt text", async () => {
    const out = await html('![x" onload="alert(1)](https://youtu.be/dQw4w9WgXcQ)');
    expect(attrNames(out)).not.toContain("onload");
    expect(out).toContain("iframe");
  });

  it("does not render style attributes from markdown", async () => {
    expect(attrNames(await html("![a](a.png){style=color:red}"))).not.toContain("style");
  });

  it("does not leak the internal placeholder key", async () => {
    const r = await renderMarkdown("![a](a.png =1x1)\n\nhttps://youtu.be/dQw4w9WgXcQ", {
      highlight: false,
    });
    expect(r.html).not.toContain("data-fl-key");
  });

  it("prefixes clobberable ids from footnotes", async () => {
    const out = await html("x[^1]\n\n[^1]: note");
    expect(out).toContain('<li id="user-content-fn-1">');
    expect(out).toContain('href="#user-content-fn-1"');
  });
});

import { describe, expect, it } from "vitest";
import { categoryTextColor, extractCategoryNames, renderMarkdown } from "../src";
import { html } from "./helpers";

const categories = [
  { id: "c-new", name: "New", color: "#22c55e" },
  { id: "c-fix", name: "Fix", color: "#1e3a8a" },
  { id: "c-imp", name: "Improvement", color: "#fde047", slug: "improvement" },
];

const render = (md: string) => renderMarkdown(md, { categories, highlight: false });

describe("inline categories", () => {
  it("renders a single category", async () => {
    const r = await render("[New]\n\nHello");
    expect(r.html).toBe(
      '<p class="fl-categories"><span class="fl-category" data-category-id="c-new" style="--fl-cat:#22c55e;--fl-cat-fg:#000000">New</span></p>\n<p>Hello</p>',
    );
    expect(r.categoryIds).toEqual(["c-new"]);
  });

  it("renders multiple categories in one paragraph", async () => {
    const r = await render("[Fix] [Improvement]");
    expect(r.html.match(/class="fl-category"/g)).toHaveLength(2);
    expect(r.html).toContain(
      'data-category-id="c-fix" style="--fl-cat:#1e3a8a;--fl-cat-fg:#ffffff"',
    );
    expect(r.categoryIds).toEqual(["c-fix", "c-imp"]);
  });

  it("matches case-insensitively and trims", async () => {
    const r = await render("[  new ] [FIX]");
    expect(r.categoryIds).toEqual(["c-new", "c-fix"]);
    expect(r.html).toContain(">New</span>");
  });

  it("dedupes ids and keeps order of first appearance", async () => {
    const r = await render("[Fix] [New] [fix]\n\ntext\n\n[New] [Improvement]");
    expect(r.categoryIds).toEqual(["c-fix", "c-new", "c-imp"]);
  });

  it("leaves unknown names as text", async () => {
    const r = await render("[Unknown]");
    expect(r.html).toBe("<p>[Unknown]</p>");
    expect(r.categoryIds).toEqual([]);
  });

  it("leaves a mix of known and unknown names as text", async () => {
    expect((await render("[New] [Nope]")).html).toBe("<p>[New] [Nope]</p>");
  });

  it("does nothing without a categories option", async () => {
    expect(await html("[New]")).toBe("<p>[New]</p>");
  });

  it("is not triggered by task lists", async () => {
    const r = await render("- [x] New\n- [ ] Fix");
    expect(r.html).not.toContain("fl-category");
    expect(r.categoryIds).toEqual([]);
  });

  it("is not triggered by links", async () => {
    const r = await render("[New](https://example.com)");
    expect(r.html).toContain('<a href="https://example.com"');
    expect(r.categoryIds).toEqual([]);
  });

  it("is not triggered by link reference definitions", async () => {
    const r = await render("[New]\n\n[new]: https://example.com");
    expect(r.html).toContain('<a href="https://example.com"');
    expect(r.html).not.toContain("fl-category");
  });

  it("is not triggered when brackets share a paragraph with text", async () => {
    expect((await render("[New] stuff")).categoryIds).toEqual([]);
  });

  it("excludes category labels from text", async () => {
    const r = await render("[New]\n\nShiny feature");
    expect(r.text).toBe("Shiny feature");
    expect(r.excerpt).toBe("Shiny feature");
  });

  it("escapes category names and ignores invalid colors", async () => {
    const r = await renderMarkdown("[Evil <b]", {
      highlight: false,
      categories: [{ id: 'x"y', name: "Evil <b", color: "red;background:url(x)" }],
    });
    expect(r.html).toBe(
      '<p class="fl-categories"><span class="fl-category" data-category-id="x&#x22;y">Evil &#x3C;b</span></p>',
    );
  });
});

describe("extractCategoryNames", () => {
  it("returns names in order, deduped", () => {
    expect(extractCategoryNames("[New] [Fix]\n\nbody\n\n[new] [Other]")).toEqual([
      "New",
      "Fix",
      "Other",
    ]);
  });

  it("ignores links, task lists and inline brackets", () => {
    expect(extractCategoryNames("[a](b)\n\n- [x] c\n\nsome [d] text\n\n`[e]`")).toEqual([]);
  });
});

describe("categoryTextColor", () => {
  it.each([
    ["#ffffff", "#000000"],
    ["#000000", "#ffffff"],
    ["#fde047", "#000000"],
    ["#1e3a8a", "#ffffff"],
    ["#fff", "#000000"],
    ["#e11d48", "#ffffff"],
    ["nope", "#000000"],
  ])("%s -> %s", (bg, fg) => {
    expect(categoryTextColor(bg)).toBe(fg);
  });
});

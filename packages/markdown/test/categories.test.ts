import { describe, expect, it } from "vitest";
import { categoryTextColor, extractCategoryNames, type MdCategory, renderMarkdown } from "../src";
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

describe("category aliases", () => {
  const es: MdCategory[] = [
    { id: "c-new", name: "Nuevo", color: "#22c55e", aliases: ["New", "Nouveau"] },
    { id: "c-fix", name: "Corrección", color: "#1e3a8a", aliases: ["Fix"] },
  ];
  const renderEs = (md: string, cats: MdCategory[] = es) =>
    renderMarkdown(md, { categories: cats, highlight: false });

  it("matches aliases case-insensitively and displays the primary name", async () => {
    const r = await renderEs("[new] [FIX] [nouveau]\n\nHola");
    expect(r.categoryIds).toEqual(["c-new", "c-fix"]);
    expect(r.html).toContain(">Nuevo</span>");
    expect(r.html).toContain(">Corrección</span>");
    expect(r.html).not.toContain(">New</span>");
    expect(r.html.match(/class="fl-category"/g)).toHaveLength(2);
  });

  it("still matches primary names", async () => {
    expect((await renderEs("[nuevo]")).categoryIds).toEqual(["c-new"]);
  });

  it("prefers primary names over aliases, and earlier aliases over later ones", async () => {
    const cats = [
      { id: "a", name: "Alpha", color: "#000000", aliases: ["Beta", "Gamma"] },
      { id: "b", name: "Beta", color: "#000000", aliases: ["Delta"] },
      { id: "c", name: "Charlie", color: "#000000", aliases: ["Delta2", "Gamma"] },
      { id: "d", name: "Dog", color: "#000000", aliases: ["Gamma"] },
    ];
    expect((await renderEs("[beta]", cats)).categoryIds).toEqual(["b"]);
    // "Gamma" is alias #1 of "a" but alias #0 of "d" → "d" wins.
    expect((await renderEs("[gamma]", cats)).categoryIds).toEqual(["d"]);
  });

  it("does not match a display-only name at primary priority with matchName: false", async () => {
    const cats = [
      { id: "a", name: "Mix", color: "#000000", aliases: ["Mix"], matchName: false },
      { id: "b", name: "Other", color: "#000000", aliases: ["Mix"] },
      { id: "c", name: "Mix", color: "#000000", matchName: false },
    ];
    // Both "a" and "b" list "Mix" as alias #0; "a" comes first. "c" never matches "Mix".
    const r = await renderEs("[mix]", cats);
    expect(r.categoryIds).toEqual(["a"]);
    expect(r.html).toContain(">Mix</span>");
    const onlyC = await renderEs("[mix]", [cats[2]!]);
    expect(onlyC.categoryIds).toEqual([]);
  });

  it("ignores empty aliases", async () => {
    const cats = [{ id: "a", name: "Alpha", color: "#000000", aliases: ["", "  "] }];
    expect((await renderEs("[Alpha]", cats)).categoryIds).toEqual(["a"]);
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

import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src";
import { html } from "./helpers";

describe("basic markdown", () => {
  it("renders emphasis and strong", async () => {
    expect(await html("*a* **b**")).toBe("<p><em>a</em> <strong>b</strong></p>");
  });

  it("renders all heading levels without ids", async () => {
    const out = await html("# 1\n## 2\n### 3\n#### 4\n##### 5\n###### 6");
    for (let i = 1; i <= 6; i++) expect(out).toContain(`<h${i}>${i}</h${i}>`);
    expect(out).not.toContain("id=");
  });

  it("renders lists, blockquotes and rules", async () => {
    const out = await html("- a\n- b\n\n1. c\n\n> quote\n\n---");
    expect(out).toContain("<ul>");
    expect(out).toContain("<ol>");
    expect(out).toContain("<blockquote>");
    expect(out).toContain("<hr>");
  });

  it("renders inline code and escapes its content", async () => {
    expect(await html("`<b>`")).toBe("<p><code>&#x3C;b></code></p>");
  });

  it("handles empty input", async () => {
    const r = await renderMarkdown("");
    expect(r).toEqual({ html: "", categoryIds: [], excerpt: "", text: "" });
  });
});

describe("GFM", () => {
  it("renders tables", async () => {
    const out = await html("| a | b |\n| - | :-: |\n| 1 | 2 |");
    expect(out).toContain("<table>");
    expect(out).toContain("<th>a</th>");
    expect(out).toContain('<td align="center">2</td>');
  });

  it("renders strikethrough", async () => {
    expect(await html("~~gone~~")).toBe("<p><del>gone</del></p>");
  });

  it("renders task lists as disabled checkboxes", async () => {
    const out = await html("- [ ] todo\n- [x] done");
    expect(out).toContain('<input type="checkbox" disabled>');
    expect(out).toContain('<input type="checkbox" checked disabled>');
    expect(out).toContain('class="task-list-item"');
  });

  it("autolinks bare URLs", async () => {
    expect(await html("see https://example.com/x now")).toContain(
      '<a href="https://example.com/x" target="_blank" rel="noopener noreferrer nofollow">https://example.com/x</a>',
    );
  });

  it("autolinks www. URLs and emails", async () => {
    const out = await html("www.example.com and me@example.com");
    expect(out).toContain('href="http://www.example.com"');
    expect(out).toContain('href="mailto:me@example.com"');
  });
});

describe("links and images", () => {
  it("does not add target to relative links", async () => {
    const out = await html("[a](/docs)");
    expect(out).toBe('<p><a href="/docs">a</a></p>');
  });

  it("resolves relative URLs against baseUrl and treats same-origin as internal", async () => {
    const out = await html("[a](/docs) [b](https://app.test/x) [c](https://other.test)", {
      baseUrl: "https://app.test/changelog/",
    });
    expect(out).toContain('<a href="https://app.test/docs">a</a>');
    expect(out).toContain('<a href="https://app.test/x">b</a>');
    expect(out).toContain('<a href="https://other.test" target="_blank"');
  });

  it("keeps mailto links without target", async () => {
    expect(await html("[m](mailto:a@b.co)")).toBe('<p><a href="mailto:a@b.co">m</a></p>');
  });

  it("adds lazy loading and async decoding to images", async () => {
    expect(await html('![Alt](https://x.test/a.png "T")')).toBe(
      '<p><img src="https://x.test/a.png" alt="Alt" title="T" loading="lazy" decoding="async"></p>',
    );
  });
});

describe("text and excerpt", () => {
  it("collapses whitespace in text", async () => {
    const r = await renderMarkdown("# Title\n\nSome   *text*\nhere.\n\n- one\n- two", {
      highlight: false,
    });
    expect(r.text).toBe("Title Some text here. one two");
    expect(r.excerpt).toBe(r.text);
  });

  it("truncates long excerpts", async () => {
    const r = await renderMarkdown("word ".repeat(100), { highlight: false });
    expect(r.excerpt.length).toBeLessThanOrEqual(161);
    expect(r.excerpt.endsWith("…")).toBe(true);
  });
});

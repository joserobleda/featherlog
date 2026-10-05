import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src";

describe("syntax highlighting", () => {
  it("highlights known languages with dual-theme CSS variables", async () => {
    const { html } = await renderMarkdown("```ts\nconst a: number = 1;\n```");
    expect(html).toContain('<pre class="shiki shiki-themes github-light github-dark"');
    expect(html).toContain("--shiki-light:");
    expect(html).toContain("--shiki-dark:");
    expect(html).toContain('data-language="ts"');
    expect(html).not.toContain("color:#");
  });

  it.each(["js", "tsx", "json", "bash", "sh", "python", "go", "sql", "yaml", "diff", "html"])(
    "highlights %s",
    async (lang) => {
      const { html } = await renderMarkdown(`\`\`\`${lang}\nx\n\`\`\``);
      expect(html).toContain('class="shiki');
    },
  );

  it("falls back to plain code for unknown languages", async () => {
    const { html } = await renderMarkdown("```nonsense\n<x>\n```");
    expect(html).toBe('<pre><code class="language-nonsense">&#x3C;x>\n</code></pre>');
  });

  it("leaves code without a language plain", async () => {
    const { html } = await renderMarkdown("```\nplain\n```");
    expect(html).toBe("<pre><code>plain\n</code></pre>");
  });

  it("skips highlighting when highlight is false", async () => {
    const { html } = await renderMarkdown("```js\nlet a\n```", { highlight: false });
    expect(html).toBe('<pre><code class="language-js">let a\n</code></pre>');
  });

  it("escapes code content when highlighting", async () => {
    const { html } = await renderMarkdown("```html\n<script>alert(1)</script>\n```");
    expect(html).not.toContain("<script>");
  });

  it("includes code in text", async () => {
    const { text } = await renderMarkdown("Intro\n\n```js\nlet a = 1\n```");
    expect(text).toBe("Intro let a = 1");
  });
});

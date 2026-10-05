import { describe, expect, it } from "vitest";
import { html } from "./helpers";

describe("media sizing", () => {
  it("applies pixel sizes as attributes", async () => {
    expect(await html("![foo](https://x.test/foo.png =100x80)")).toBe(
      '<p><img src="https://x.test/foo.png" alt="foo" width="100" height="80" loading="lazy" decoding="async"></p>',
    );
  });

  it("supports auto height", async () => {
    const out = await html("![bar](bar.jpg =100x*)");
    expect(out).toContain('width="100"');
    expect(out).not.toContain("height");
  });

  it("supports explicit px units", async () => {
    expect(await html("![a](a.png =120pxx40px)")).toContain('width="120" height="40"');
  });

  it("applies units as inline style", async () => {
    expect(await html("![baz](baz.jpg =80%x5em)")).toContain('style="width:80%;height:5em"');
  });

  it("supports auto width with a unit height", async () => {
    expect(await html("![baz](baz.jpg =*x10rem)")).toContain('style="height:10rem"');
  });

  it("keeps a title alongside the size", async () => {
    const out = await html('![a](a.png "My title" =10x20)');
    expect(out).toContain('title="My title"');
    expect(out).toContain('width="10" height="20"');
  });

  it("sizes video embeds", async () => {
    const out = await html("![Tour](https://vimeo.com/123456 =640x360)");
    expect(out).toContain('<div class="fl-video" style="width:640px;height:360px">');
    expect(out).toContain('title="Tour"');
  });

  it("sizes video embeds with units", async () => {
    expect(await html("![Tour](https://youtu.be/dQw4w9WgXcQ =100%x*)")).toContain(
      '<div class="fl-video" style="width:100%">',
    );
  });

  it("leaves sizing syntax in fenced code blocks untouched", async () => {
    const out = await html("```\n![foo](foo.png =100x80)\n```");
    expect(out).toContain("![foo](foo.png =100x80)");
    expect(out).not.toContain("fl-size");
  });

  it("leaves sizing syntax in tilde fences untouched", async () => {
    expect(await html("~~~md\n![foo](foo.png =1x2)\n~~~")).toContain("![foo](foo.png =1x2)");
  });

  it("leaves sizing syntax in indented code untouched", async () => {
    const out = await html("Para\n\n    ![foo](foo.png =100x80)");
    expect(out).toContain("<pre><code>![foo](foo.png =100x80)");
  });

  it("leaves sizing syntax in inline code untouched", async () => {
    const out = await html("Use `![foo](foo.png =100x80)` and ![a](a.png =5x6)");
    expect(out).toContain("<code>![foo](foo.png =100x80)</code>");
    expect(out).toContain('width="5" height="6"');
  });

  it("ignores invalid size syntax", async () => {
    const out = await html("![a](a.png =bigxhuge)");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("style=");
  });

  it("does not let users inject styles via the marker title", async () => {
    const out = await html('![a](a.png "fl-size:1x1;background:url(x)")');
    expect(out).not.toContain("style=");
    expect(out).toContain('title="fl-size:1x1;background:url(x)"');
  });
});

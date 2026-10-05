import { describe, expect, it } from "vitest";
import { parseVideoUrl, renderMarkdown } from "../src";
import { html } from "./helpers";

const YT = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";

describe("parseVideoUrl", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", YT],
    ["https://youtube.com/watch?v=dQw4w9WgXcQ&list=x", YT],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", YT],
    ["https://youtu.be/dQw4w9WgXcQ", YT],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", YT],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", YT],
    ["https://youtu.be/dQw4w9WgXcQ?t=90", `${YT}?start=90`],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s", `${YT}?start=90`],
  ])("parses YouTube %s", (url, embedUrl) => {
    expect(parseVideoUrl(url)).toEqual({ provider: "youtube", id: "dQw4w9WgXcQ", embedUrl });
  });

  it("parses Vimeo", () => {
    expect(parseVideoUrl("https://vimeo.com/76979871")).toEqual({
      provider: "vimeo",
      id: "76979871",
      embedUrl: "https://player.vimeo.com/video/76979871",
    });
    expect(parseVideoUrl("https://vimeo.com/76979871/abc123def")?.embedUrl).toBe(
      "https://player.vimeo.com/video/76979871?h=abc123def",
    );
    expect(parseVideoUrl("https://player.vimeo.com/video/76979871")?.id).toBe("76979871");
  });

  it("parses Loom", () => {
    const id = "e5b8c04bca094dd8a5507925ab887002";
    expect(parseVideoUrl(`https://www.loom.com/share/${id}`)).toEqual({
      provider: "loom",
      id,
      embedUrl: `https://www.loom.com/embed/${id}`,
    });
    expect(parseVideoUrl(`https://loom.com/share/${id}?sid=1`)?.id).toBe(id);
  });

  it("parses Wistia", () => {
    const expected = {
      provider: "wistia",
      id: "abc123xyz0",
      embedUrl: "https://fast.wistia.net/embed/iframe/abc123xyz0",
    };
    expect(parseVideoUrl("https://acme.wistia.com/medias/abc123xyz0")).toEqual(expected);
    expect(parseVideoUrl("https://wistia.com/medias/abc123xyz0")).toEqual(expected);
  });

  it.each([
    "https://example.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch",
    "https://www.youtube.com/channel/UCabcdefgh",
    "https://youtu.be/bad%22id",
    "https://vimeo.com/channels/staffpicks",
    "https://www.loom.com/looms/abc",
    "javascript:alert(1)//youtu.be/dQw4w9WgXcQ",
    "https://evilwistia.com/medias/abc123xyz0",
    "not a url",
  ])("rejects %s", (url) => {
    expect(parseVideoUrl(url)).toBeNull();
  });
});

describe("video embeds", () => {
  it("embeds a URL alone in a paragraph", async () => {
    expect(await html("https://youtu.be/dQw4w9WgXcQ")).toBe(
      `<div class="fl-video"><iframe src="${YT}" title="YouTube video" loading="lazy" allowfullscreen allow="autoplay; fullscreen; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`,
    );
  });

  it.each([
    ["https://vimeo.com/76979871", "https://player.vimeo.com/video/76979871"],
    [
      "https://www.loom.com/share/e5b8c04bca094dd8a5507925ab887002",
      "https://www.loom.com/embed/e5b8c04bca094dd8a5507925ab887002",
    ],
    [
      "https://acme.wistia.com/medias/abc123xyz0",
      "https://fast.wistia.net/embed/iframe/abc123xyz0",
    ],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", YT],
  ])("embeds %s", async (url, embed) => {
    const out = await html(url);
    expect(out).toContain(`<div class="fl-video"><iframe src="${embed}"`);
    expect(out).not.toContain("<a ");
  });

  it("embeds angle-bracket autolinks", async () => {
    expect(await html("<https://youtu.be/dQw4w9WgXcQ>")).toContain('class="fl-video"');
  });

  it("embeds a URL at the end of a line of text, keeping the text", async () => {
    const out = await html("Watch the demo: https://youtu.be/dQw4w9WgXcQ\nIt is great.");
    expect(out).toBe(
      `<p>Watch the demo:</p>\n<div class="fl-video"><iframe src="${YT}" title="YouTube video" loading="lazy" allowfullscreen allow="autoplay; fullscreen; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>\n<p>It is great.</p>`,
    );
  });

  it("does not embed a URL in the middle of a line", async () => {
    const out = await html("See https://youtu.be/dQw4w9WgXcQ for details");
    expect(out).not.toContain("iframe");
    expect(out).toContain('<a href="https://youtu.be/dQw4w9WgXcQ"');
  });

  it("does not embed explicit links", async () => {
    const url = "https://youtu.be/dQw4w9WgXcQ";
    const out = await html(`[${url}](${url})`);
    expect(out).not.toContain("iframe");
    expect(out).toContain(`<a href="${url}"`);
  });

  it("does not embed explicit links with other text", async () => {
    expect(await html("[Watch](https://youtu.be/dQw4w9WgXcQ)")).not.toContain("iframe");
  });

  it("embeds image syntax with a video URL and uses alt as title", async () => {
    const out = await html("![Product tour](https://vimeo.com/123456)");
    expect(out).toContain(
      '<div class="fl-video"><iframe src="https://player.vimeo.com/video/123456" title="Product tour"',
    );
    expect(out).not.toContain("<img");
  });

  it("embeds videos inside list items", async () => {
    const out = await html("- https://youtu.be/dQw4w9WgXcQ\n- other");
    expect(out).toContain('<li>\n<div class="fl-video">');
  });

  it("embeds multiple videos on separate lines", async () => {
    const out = await html("https://youtu.be/dQw4w9WgXcQ\nhttps://vimeo.com/123456");
    expect(out.match(/<iframe/g)).toHaveLength(2);
  });

  it("excludes embeds from text", async () => {
    const r = await renderMarkdown("Intro https://youtu.be/dQw4w9WgXcQ", { highlight: false });
    expect(r.text).toBe("Intro");
  });
});

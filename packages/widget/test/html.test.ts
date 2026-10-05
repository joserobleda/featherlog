import { describe, expect, it } from "vitest";
import { frameDocument, safeJson } from "../src/index";
import { frameData } from "./fixtures";

describe("frameDocument", () => {
  it("renders a full document", () => {
    const html = frameDocument({
      data: frameData({ locale: "ar", dir: "rtl" }),
      frameJsUrl: "/_widget-static/frame.js",
      frameCssUrl: "/_widget-static/frame.css",
      nonce: "abc123",
    });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain('name="viewport"');
    expect(html).toContain('<link rel="stylesheet" href="/_widget-static/frame.css">');
    expect(html).toContain('<script nonce="abc123">window.__FL__=');
    expect(html).toContain('<script src="/_widget-static/frame.js" defer nonce="abc123"></script>');
    expect(html).toContain('<div id="fl-app"></div>');
  });

  it("omits nonce when not given", () => {
    const html = frameDocument({ data: frameData(), frameJsUrl: "a.js", frameCssUrl: "a.css" });
    expect(html).not.toContain("nonce");
  });

  it("escapes JSON so it cannot break out of the script element", () => {
    const evil = "</script><script>alert(1)</script> & \u2028\u2029 <!--";
    const data = frameData();
    data.items[0]!.title = evil;
    data.workspace.name = '"><img src=x>';
    const html = frameDocument({ data, frameJsUrl: "a.js", frameCssUrl: "a.css" });
    const inline = html.slice(html.indexOf("window.__FL__="), html.indexOf("</script>"));
    expect(inline).not.toMatch(/[<>&\u2028\u2029]/);
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    expect(html).not.toContain("<img");
    const json = inline.slice("window.__FL__=".length);
    expect(JSON.parse(json).items[0].title).toBe(evil);
  });

  it("escapes attribute values", () => {
    const html = frameDocument({
      data: frameData(),
      frameJsUrl: 'x.js"><script>',
      frameCssUrl: "a.css",
    });
    expect(html).toContain('src="x.js&quot;&gt;&lt;script&gt;"');
  });

  it("safeJson round-trips", () => {
    const v = { a: "<b>&</b>\u2028" };
    expect(JSON.parse(safeJson(v))).toEqual(v);
  });
});

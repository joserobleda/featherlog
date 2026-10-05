import { createHash } from "node:crypto";
import { frameDocument, safeJson } from "@featherlog/widget";
import { widgetUrl } from "@/lib/urls";
import { buildFrameData, WIDGET_CACHE_CONTROL, widgetAssetVersion } from "@/lib/widget-data";

export const dynamic = "force-dynamic";

const FRAME_SRC = [
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
  "https://www.loom.com",
  "https://fast.wistia.net",
].join(" ");

const NOT_FOUND_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Not found</title></head><body><p>Unknown widget account.</p></body></html>`;

/**
 * GET /_widget/:account?lang=&embed= — the HTML document loaded inside the widget iframe.
 * Uses a hash-based CSP (not a nonce) so the response can be cached by CDNs.
 */
export async function GET(req: Request, { params }: { params: Promise<{ account: string }> }) {
  const { account } = await params;
  const url = new URL(req.url);
  const data = await buildFrameData(account, {
    lang: url.searchParams.get("lang"),
    acceptLanguage: req.headers.get("accept-language"),
  });
  if (!data) {
    return new Response(NOT_FOUND_HTML, {
      status: 404,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, s-maxage=60",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  }
  const v = widgetAssetVersion();
  const html = frameDocument({
    data,
    frameJsUrl: widgetUrl(`/widget/frame.js?v=${v}`),
    frameCssUrl: widgetUrl(`/widget/frame.css?v=${v}`),
  });
  // Must match the inline script emitted by frameDocument() byte for byte.
  const inline = `window.__FL__=${safeJson(data)}`;
  const hash = createHash("sha256").update(inline, "utf8").digest("base64");
  const origin = new URL(widgetUrl()).origin;
  const csp = [
    "default-src 'none'",
    `script-src 'sha256-${hash}' ${origin}`,
    `style-src 'self' 'unsafe-inline' ${origin}`,
    "img-src * data:",
    "media-src * data:",
    `frame-src ${FRAME_SRC}`,
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": csp,
      "Cache-Control": WIDGET_CACHE_CONTROL,
      Vary: "Accept-Language",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}

import type { FrameData } from "./types";

const attr = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );

/** JSON safe to embed inside an inline `<script>` element. */
export function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/** Full HTML document served at `/_widget/:account` and loaded inside the widget iframe. */
export function frameDocument(opts: {
  data: FrameData;
  frameJsUrl: string;
  frameCssUrl: string;
  nonce?: string;
}): string {
  const { data } = opts;
  const nonce = opts.nonce ? ` nonce="${attr(opts.nonce)}"` : "";
  return `<!doctype html>
<html lang="${attr(data.locale)}" dir="${data.dir === "rtl" ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>${attr(`${data.strings.title} · ${data.workspace.name}`)}</title>
<link rel="stylesheet" href="${attr(opts.frameCssUrl)}">
<script${nonce}>window.__FL__=${safeJson(data)}</script>
<script src="${attr(opts.frameJsUrl)}" defer${nonce}></script>
</head>
<body>
<div id="fl-app"></div>
</body>
</html>
`;
}

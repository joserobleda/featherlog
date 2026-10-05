/**
 * Headway-style media sizing: `![alt](url =100x80)`, `![alt](url =100x*)`, `![alt](url =80%x5em)`.
 *
 * CommonMark cannot parse these, so the source is rewritten before parsing into a title
 * marker (`![alt](url "fl-size:WxH|original title")`) that is decoded again on the mdast.
 */

const DIM = String.raw`(?:\d+(?:\.\d+)?(?:px|%|em|rem|vw|vh|ch)?|\*|auto)`;
const SIZE_RE = new RegExp(
  String.raw`(!\[(?:[^\]\\\n]|\\.)*\]\()[ \t]*(<[^>\n]*>|[^\s)]+)(?:[ \t]+("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'))?[ \t]+=(${DIM})x(${DIM})[ \t]*\)`,
  "g",
);
const MARKER_RE = new RegExp(String.raw`^fl-size:(${DIM})x(${DIM})(?:\|([\s\S]*))?$`);

export const SIZE_MARKER_PREFIX = "fl-size:";

export type MediaSize = { width: string | null; height: string | null };

function rewriteSegment(text: string): string {
  if (!text.includes("=")) return text;
  return text.replace(
    SIZE_RE,
    (_all, open: string, url: string, title: string | undefined, w: string, h: string) => {
      let inner = "";
      if (title) {
        inner = title.slice(1, -1);
        if (title.startsWith("'")) inner = inner.replace(/\\'/g, "'").replace(/"/g, '\\"');
      }
      return `${open}${url} "${SIZE_MARKER_PREFIX}${w}x${h}${title ? `|${inner}` : ""}")`;
    },
  );
}

/** Applies `rewriteSegment` only outside inline code spans. */
function rewriteLine(line: string): string {
  if (!line.includes("=")) return line;
  if (!line.includes("`")) return rewriteSegment(line);
  let out = "";
  let last = 0;
  let i = 0;
  while (i < line.length) {
    if (line[i] !== "`") {
      i++;
      continue;
    }
    let n = 0;
    while (line[i + n] === "`") n++;
    const run = "`".repeat(n);
    // Find a closing run of exactly n backticks.
    let j = line.indexOf(run, i + n);
    while (j !== -1 && (line[j + n] === "`" || line[j - 1] === "`")) {
      let k = j;
      while (line[k] === "`") k++;
      j = line.indexOf(run, k);
    }
    if (j === -1) {
      i += n;
      continue;
    }
    out += rewriteSegment(line.slice(last, i)) + line.slice(i, j + n);
    last = j + n;
    i = j + n;
  }
  return out + rewriteSegment(line.slice(last));
}

const FENCE_RE = /^\s*(`{3,}|~{3,})(.*)$/;
const LIST_RE = /^ {0,3}(?:[-*+]|\d{1,9}[.)])(?:\s|$)/;
const INDENTED_RE = /^(?: {4}|\t)/;

/** Rewrites sizing syntax outside fenced code, indented code and inline code. */
export function preprocessSizing(md: string): string {
  if (!md.includes("=")) return md;
  const lines = md.split("\n");
  let fence: { char: string; len: number } | null = null;
  let prevBlank = true;
  let prevIndentedCode = false;
  let inList = false;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx] ?? "";
    const blank = line.trim() === "";

    if (fence) {
      const m = FENCE_RE.exec(line);
      if (m?.[1] && m[1][0] === fence.char && m[1].length >= fence.len && !m[2]?.trim()) {
        fence = null;
      }
      prevBlank = false;
      continue;
    }

    const open = FENCE_RE.exec(line);
    if (open?.[1] && !(open[1][0] === "`" && open[2]?.includes("`"))) {
      fence = { char: open[1][0] ?? "`", len: open[1].length };
      prevBlank = false;
      prevIndentedCode = false;
      continue;
    }

    if (!blank && INDENTED_RE.test(line) && !inList && (prevBlank || prevIndentedCode)) {
      prevIndentedCode = true;
      prevBlank = false;
      continue;
    }

    if (!blank) {
      if (LIST_RE.test(line)) inList = true;
      else if (prevBlank && !INDENTED_RE.test(line)) inList = false;
      prevIndentedCode = false;
    }
    prevBlank = blank;
    lines[idx] = rewriteLine(line);
  }
  return lines.join("\n");
}

/** Decodes a title produced by `preprocessSizing`. */
export function decodeSizeTitle(
  title: string | null | undefined,
): { size: MediaSize; title: string | null } | null {
  if (!title?.startsWith(SIZE_MARKER_PREFIX)) return null;
  const m = MARKER_RE.exec(title);
  if (!m) return null;
  const norm = (v: string | undefined) => (!v || v === "*" || v === "auto" ? null : v);
  return {
    size: { width: norm(m[1]), height: norm(m[2]) },
    title: m[3] === undefined || m[3] === "" ? null : m[3],
  };
}

const PX_RE = /^\d+(?:px)?$/;

/** Converts a size to either plain width/height attributes (pixels) or an inline style. */
export function sizeToProperties(
  size: MediaSize,
  forceStyle = false,
): { width?: number; height?: number; style?: string } {
  const { width, height } = size;
  if (!width && !height) return {};
  const pxOnly = [width, height].every((v) => v === null || PX_RE.test(v));
  if (pxOnly && !forceStyle) {
    const out: { width?: number; height?: number } = {};
    if (width) out.width = Number.parseInt(width, 10);
    if (height) out.height = Number.parseInt(height, 10);
    return out;
  }
  const css = (v: string) => (/^\d+(?:\.\d+)?$/.test(v) ? `${v}px` : v);
  const decls: string[] = [];
  if (width) decls.push(`width:${css(width)}`);
  if (height) decls.push(`height:${css(height)}`);
  return { style: decls.join(";") };
}

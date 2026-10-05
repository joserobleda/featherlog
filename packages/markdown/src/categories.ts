import type { Paragraph } from "mdast";

export type MdCategory = {
  id: string;
  /** Display name (shown in the rendered chip) and primary marker name. */
  name: string;
  color: string;
  slug?: string;
  /**
   * Other names that also match a `[Marker]` (case-insensitive), e.g. the category's name in
   * other locales. Primary names of any category win over aliases; earlier aliases win over later.
   */
  aliases?: string[];
  /**
   * Whether `name` itself matches markers at primary priority. Default `true`. Set to `false`
   * when `name` is only a display fallback (e.g. no name in the translation's locale); list it in
   * `aliases` at the right priority instead.
   */
  matchName?: boolean;
};

const LINE_RE = /^\s*(?:\[[^[\]\n]+\]\s*)+$/;
const NAME_RE = /\[([^[\]\n]+)\]/g;
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Returns the category names of a paragraph that consists only of `[Name]` markers. */
export function categoryMarkerNames(paragraph: Paragraph): string[] | null {
  if (paragraph.children.length !== 1) return null;
  const only = paragraph.children[0];
  if (only?.type !== "text" || !LINE_RE.test(only.value)) return null;
  const names = [...only.value.matchAll(NAME_RE)].map((m) => (m[1] ?? "").trim());
  return names.length > 0 && names.every(Boolean) ? names : null;
}

export function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function isHexColor(value: string): boolean {
  return HEX_RE.test(value.trim());
}

function expandHex(hex: string): string | null {
  const h = hex.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(h)) return [...h].map((c) => c + c).join("");
  if (/^[0-9a-f]{6}$/i.test(h)) return h;
  return null;
}

/**
 * Picks black or white text for a background color, whichever has the higher WCAG contrast.
 * Invalid colors fall back to black text.
 */
export function categoryTextColor(hex: string): "#000000" | "#ffffff" {
  const full = expandHex(hex);
  if (!full) return "#000000";
  const channel = (i: number) => {
    const c = Number.parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  // Labels are small bold text on a coloured pill: prefer white while it keeps a 3:1 contrast
  // (WCAG large/bold text), which matches how brand colours are usually designed.
  const contrastWhite = 1.05 / (l + 0.05);
  return contrastWhite >= 3 ? "#ffffff" : "#000000";
}

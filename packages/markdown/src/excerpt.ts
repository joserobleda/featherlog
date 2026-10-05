/** Collapses whitespace and truncates on a word boundary, appending "…" when shortened. */
export function makeExcerpt(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  if (max <= 0) return "…";
  let cut = clean.slice(0, max);
  // Only back off to a word boundary if we cut through a word.
  if (clean[max] !== " ") {
    const space = cut.lastIndexOf(" ");
    if (space > 0) cut = cut.slice(0, space);
  }
  cut = cut.replace(/[\s,;:.!?\-–—]+$/u, "");
  return `${cut}…`;
}

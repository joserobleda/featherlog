import { type HTMLElement, parse } from "node-html-parser";
import TurndownService from "turndown";

/** A published entry read from a public Headway changelog page. */
export type HeadwayEntry = {
  id: string;
  account: string;
  title: string;
  /** ISO publication date. */
  date: string;
  /** Inner HTML of the entry body. */
  html: string;
  categories: string[];
  images: string[];
  url: string;
};

const BASE = "https://headwayapp.co";
const USER_AGENT = "FeatherlogImporter/1.0 (+https://github.com/joserobleda/featherlog)";

/** Parses one page of `https://headwayapp.co/<account>` (entries + "previous" cursor link). */
export function parseHeadwayPage(
  html: string,
  account: string,
): { entries: HeadwayEntry[]; next: string | null } {
  const root = parse(html);
  const entries: HeadwayEntry[] = [];
  for (const item of root.querySelectorAll(".changelogItem")) {
    const link = item.querySelector("h2.title a") ?? item.querySelector(".title a");
    const href = link?.getAttribute("href") ?? "";
    const id = /-(\d+)$/.exec(href)?.[1];
    const content = item.querySelector(".content");
    const date = item.querySelector("time")?.getAttribute("datetime");
    if (!id || !content || !date) continue;
    const categories = content
      .querySelectorAll("h3.category")
      .map((h) => h.text.trim())
      .filter(Boolean);
    const images = content
      .querySelectorAll("img")
      .map((img) => img.getAttribute("src") ?? "")
      .filter((src) => /^https?:\/\//.test(src));
    entries.push({
      id,
      account,
      title: decodeEntities(link?.text.trim() ?? ""),
      date: new Date(date).toISOString(),
      html: content.innerHTML,
      categories: [...new Set(categories)],
      images: [...new Set(images)],
      url: `${BASE}${href}`,
    });
  }
  const nextHref = root.querySelector(".pagination a")?.getAttribute("href");
  return { entries, next: nextHref ? new URL(decodeEntities(nextHref), BASE).toString() : null };
}

function decodeEntities(s: string) {
  return parse(`<p>${s}</p>`).text;
}

/** Reads every published entry of a public Headway changelog, following pagination. */
export async function crawlHeadway(
  account: string,
  opts: { fetch?: typeof fetch; delayMs?: number; maxPages?: number } = {},
): Promise<HeadwayEntry[]> {
  const doFetch = opts.fetch ?? fetch;
  const seen = new Map<string, HeadwayEntry>();
  let url: string | null = `${BASE}/${encodeURIComponent(account)}`;
  for (let page = 0; url && page < (opts.maxPages ?? 200); page++) {
    const res = await doFetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" } });
    if (!res.ok) throw new Error(`Headway returned ${res.status} for ${url}`);
    const { entries, next } = parseHeadwayPage(await res.text(), account);
    for (const e of entries) seen.set(e.id, e);
    url = next;
    if (url && opts.delayMs !== 0) await new Promise((r) => setTimeout(r, opts.delayMs ?? 400));
  }
  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/* ------------------------------------------------------------------ */
/* HTML → Featherlog Markdown                                          */
/* ------------------------------------------------------------------ */

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "_",
});
turndown.remove(["script", "style"]);

/**
 * Converts an entry's HTML to Markdown. Category labels become a `[Name]` paragraph at the top
 * (Featherlog's inline category syntax); `imageMap` rewrites image URLs (re-hosted copies).
 */
export function headwayToMarkdown(
  entry: Pick<HeadwayEntry, "html" | "categories">,
  imageMap?: Map<string, string>,
) {
  const root = parse(`<div>${entry.html}</div>`);
  for (const el of root.querySelectorAll(
    "h3.category, span.beforeCategories, span.afterCategories",
  ))
    el.remove();
  for (const img of root.querySelectorAll("img")) {
    const src = img.getAttribute("src") ?? "";
    const mapped = imageMap?.get(src);
    if (mapped) img.setAttribute("src", mapped);
    for (const attr of ["width", "height"]) img.removeAttribute(attr);
  }
  const body = turndown
    .turndown((root.firstChild as HTMLElement).innerHTML.replace(/&nbsp;/g, " "))
    .replace(/ /g, " ")
    .replace(/^(\s*)([-*]|\d+\.) {2,}/gm, "$1$2 ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const cats = entry.categories.map((c) => `[${c}]`).join(" ");
  return cats ? `${cats}\n\n${body}` : body;
}

/* ------------------------------------------------------------------ */
/* Pairing translations across accounts                                */
/* ------------------------------------------------------------------ */

export type Source = { account: string; locale: string; entries: HeadwayEntry[] };

export type ImportGroup = {
  /** Entries keyed by locale. */
  items: Record<string, HeadwayEntry>;
  /** How the group was formed (for the review report). */
  match: "single" | "same-day" | "shared-image" | "time-order" | "adjacent-day" | "manual";
};

export type PairOverrides = { pairs?: [string, string][]; unpair?: string[] };

const day = (iso: string) => iso.slice(0, 10);
const imageKey = (url: string) => url.split("/").pop()?.split("?")[0] ?? url;

/**
 * Groups entries from several single-language accounts into multi-language posts.
 * The first source is the primary one; others are matched to it by date, shared images and order.
 */
export function pairEntries(sources: Source[], overrides: PairOverrides = {}): ImportGroup[] {
  const [primary, ...others] = sources;
  if (!primary) return [];
  const unpair = new Set(overrides.unpair ?? []);
  const groups = new Map<string, ImportGroup>(
    primary.entries.map((e) => [
      e.id,
      { items: { [primary.locale]: e }, match: "single" as ImportGroup["match"] },
    ]),
  );

  for (const other of others) {
    const free = new Map(other.entries.map((e) => [e.id, e]));
    const openPrimary = () =>
      primary.entries.filter((p) => !groups.get(p.id)!.items[other.locale] && !unpair.has(p.id));
    const attach = (p: HeadwayEntry, o: HeadwayEntry, match: ImportGroup["match"]) => {
      const g = groups.get(p.id)!;
      g.items[other.locale] = o;
      g.match = match;
      free.delete(o.id);
    };

    // 1. Manual pairs.
    for (const [a, b] of overrides.pairs ?? []) {
      const p = primary.entries.find((e) => e.id === a || e.id === b);
      const o = other.entries.find((e) => e.id === a || e.id === b);
      if (p && o && free.has(o.id)) attach(p, o, "manual");
    }

    // 2. Same day: unique pairs, then shared images, then time order.
    const byDay = (list: HeadwayEntry[]) => {
      const m = new Map<string, HeadwayEntry[]>();
      for (const e of list) m.set(day(e.date), [...(m.get(day(e.date)) ?? []), e]);
      return m;
    };
    const otherByDay = byDay([...free.values()].filter((e) => !unpair.has(e.id)));
    for (const [d, ps] of byDay(openPrimary())) {
      const os = (otherByDay.get(d) ?? []).filter((o) => free.has(o.id));
      if (ps.length === 1 && os.length === 1) {
        attach(ps[0]!, os[0]!, "same-day");
        continue;
      }
      const rest = [...ps];
      for (const p of ps) {
        const keys = new Set(p.images.map(imageKey));
        const o = os.find((x) => free.has(x.id) && x.images.some((i) => keys.has(imageKey(i))));
        if (o && keys.size > 0) {
          attach(p, o, "shared-image");
          rest.splice(rest.indexOf(p), 1);
        }
      }
      // Headway ids grow with creation order, which mirrors how translations were written
      // more reliably than the (often identical) publication time.
      const byId = (a: HeadwayEntry, b: HeadwayEntry) => Number(a.id) - Number(b.id);
      const remaining = os.filter((o) => free.has(o.id)).sort(byId);
      rest.sort(byId);
      for (let i = 0; i < Math.min(rest.length, remaining.length); i++)
        attach(rest[i]!, remaining[i]!, "time-order");
    }

    // 3. Leftovers a few days apart (time zones / late translations): only unambiguous matches
    //    with the same categories.
    const WINDOW = 4 * 24 * 3_600_000;
    const sameCats = (a: HeadwayEntry, b: HeadwayEntry) =>
      [...a.categories].sort().join("|").toLowerCase() ===
      [...b.categories].sort().join("|").toLowerCase();
    const close = (a: HeadwayEntry, b: HeadwayEntry) =>
      Math.abs(Date.parse(a.date) - Date.parse(b.date)) <= WINDOW && sameCats(a, b);
    for (const p of openPrimary()) {
      const near = [...free.values()].filter((o) => !unpair.has(o.id) && close(p, o));
      const competitors = openPrimary().filter((q) => near.some((o) => close(q, o)));
      if (near.length === 1 && competitors.length === 1) attach(p, near[0]!, "adjacent-day");
    }

    // 4. Unmatched entries become posts of their own.
    for (const o of free.values())
      groups.set(`${other.locale}:${o.id}`, { items: { [other.locale]: o }, match: "single" });
  }

  return [...groups.values()].sort((a, b) => groupDate(a).localeCompare(groupDate(b)));
}

/** Earliest publication date among a group's entries. */
export function groupDate(g: ImportGroup) {
  return Object.values(g.items)
    .map((e) => e.date)
    .sort()[0]!;
}

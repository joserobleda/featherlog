import { computeUnseen } from "./core";
import type { FrameToHost, HostToFrameMessage, ReadyItem } from "./protocol";
import type { FrameData, FrameItem } from "./types";

export const POWERED_BY_URL = "https://github.com/joserobleda/featherlog";

export type FrameOptions = {
  embed: boolean;
  send: <K extends keyof FrameToHost>(type: K, payload: FrameToHost[K]) => void;
};

export type FrameApp = { receive(m: HostToFrameMessage): void; destroy(): void };

/** Renders the widget UI into `root` (inside the iframe document). */
export function mountFrame(root: HTMLElement, data: FrameData, opts: FrameOptions): FrameApp {
  const doc = root.ownerDocument;
  const win = doc.defaultView as Window;
  const html = doc.documentElement;
  const { send, embed } = opts;
  let strings = { ...data.strings };
  let labels: Record<string, string> = {};
  let seen: string[] | null = null;
  let detail: FrameItem | null = null;
  let raf = 0;

  html.lang = data.locale;
  html.dir = data.dir;
  html.style.setProperty("--fl-accent", data.settings.accentColor);
  if (embed) html.classList.add("fl-embed");

  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat(data.locale, { dateStyle: "medium" });
  } catch {
    fmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
  }
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : fmt.format(d);
  };

  const h = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    cls?: string,
    text?: string,
  ): HTMLElementTagNameMap[K] => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const button = (cls: string, text: string, onClick: () => void) => {
    const b = h("button", cls, text);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  };
  const link = (cls: string, text: string, href: string) => {
    const a = h("a", cls, text);
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  };

  const ready = (item: FrameItem, position: number): ReadyItem => ({
    id: item.id,
    date: item.date,
    title: item.title,
    categoryIds: item.categoryIds,
    position,
  });

  const meta = (item: FrameItem, isNew: boolean) => {
    const m = h("span", "fl-meta");
    if (isNew) m.appendChild(h("span", "fl-new", strings.newBadge));
    for (const id of item.categoryIds) {
      const c = data.categories[id];
      if (!c) continue;
      const chip = h(
        "span",
        "fl-chip",
        labels[c.name.toLowerCase()] ?? labels[c.slug.toLowerCase()] ?? c.name,
      );
      chip.style.background = c.color;
      chip.style.color = c.textColor;
      m.appendChild(chip);
    }
    const t = h("time", "fl-date", fmtDate(item.date));
    t.dateTime = item.date;
    m.appendChild(t);
    return m;
  };

  const header = (first: HTMLElement) => {
    const hd = h("header", "fl-header");
    hd.appendChild(first);
    if (!embed) {
      const close = button("fl-close", "×", () => send("hide", null));
      close.setAttribute("aria-label", "Close");
      hd.appendChild(close);
    }
    return hd;
  };

  const renderList = (focusId?: string) => {
    detail = null;
    root.textContent = "";
    root.className = "fl-list-view";
    root.appendChild(header(h("h1", "fl-title", strings.title)));
    const main = h("main", "fl-main");
    const fresh = seen
      ? new Set(
          computeUnseen(data.items, seen, data.settings.expireAfterDays, Date.now()).map(
            (i) => i.id,
          ),
        )
      : new Set<string>();
    let toFocus: HTMLElement | null = null;
    if (!data.items.length) main.appendChild(h("p", "fl-empty", strings.empty));
    else {
      const ul = h("ul", "fl-list");
      for (const [i, item] of data.items.entries()) {
        const li = h("li");
        const b = button(`fl-item${fresh.has(item.id) ? " fl-unseen" : ""}`, "", () =>
          openDetail(item, i),
        );
        b.dataset.id = item.id;
        b.append(
          meta(item, fresh.has(item.id)),
          h("span", "fl-item-title", item.title),
          h("span", "fl-excerpt", item.excerpt),
        );
        li.appendChild(b);
        ul.appendChild(li);
        if (item.id === focusId) toFocus = b;
      }
      main.appendChild(ul);
    }
    root.appendChild(main);
    const ft = h("footer", "fl-footer");
    ft.appendChild(link("fl-footer-link", strings.footer, data.workspace.url));
    if (!data.settings.whitelabel)
      ft.appendChild(link("fl-powered", strings.poweredBy, POWERED_BY_URL));
    root.appendChild(ft);
    toFocus?.focus();
    measure();
  };

  const renderDetail = (item: FrameItem, i: number) => {
    detail = item;
    root.textContent = "";
    root.className = "fl-detail-view";
    const back = button("fl-back", strings.back, () => renderList(item.id));
    root.appendChild(header(back));
    const art = h("article", "fl-detail");
    art.appendChild(h("h2", "fl-detail-title", item.title));
    art.appendChild(meta(item, false));
    const content = h("div", "fl-content");
    content.innerHTML = item.html;
    art.appendChild(content);
    if (item.url) {
      const more = link("fl-readmore", strings.readMore, item.url);
      more.addEventListener("click", () => send("readMore", { item: ready(item, i) }));
      art.appendChild(more);
    }
    root.appendChild(art);
    win.scrollTo?.(0, 0);
    measure();
    return back;
  };

  const openDetail = (item: FrameItem, i: number) => {
    renderDetail(item, i).focus();
    send("showDetails", { item: ready(item, i) });
    send("markRead", { id: item.id });
  };

  const rerender = () => {
    if (detail) renderDetail(detail, data.items.indexOf(detail));
    else renderList();
  };

  const measure = () => {
    if (raf) return;
    raf = win.requestAnimationFrame(() => {
      raf = 0;
      send("setHeight", { height: Math.ceil(root.getBoundingClientRect().height) });
    });
  };

  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
  ro?.observe(root);

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    if (!embed) send("hide", null);
    else if (detail) renderList(detail.id);
  };
  doc.addEventListener("keydown", onKey);

  renderList();
  const categories: Record<string, string> = {};
  for (const id in data.categories) categories[id] = data.categories[id]?.name ?? "";
  send("ready", { items: data.items.map(ready), settings: data.settings, categories });

  return {
    receive(m) {
      if (m.type === "init") {
        const t = m.payload.translations || {};
        seen = m.payload.seen;
        strings = { ...data.strings };
        if (t.title) strings.title = t.title;
        if (t.readMore) strings.readMore = t.readMore;
        if (t.footer) strings.footer = t.footer;
        labels = {};
        for (const k in t.labels || {}) labels[k.toLowerCase()] = String(t.labels?.[k]);
        rerender();
      } else if (m.type === "closed" && detail) renderList();
    },
    destroy() {
      ro?.disconnect();
      doc.removeEventListener("keydown", onKey);
      if (raf) win.cancelAnimationFrame(raf);
      root.textContent = "";
    },
  };
}

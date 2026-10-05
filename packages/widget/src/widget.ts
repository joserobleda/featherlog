import { computePosition, computeUnseen } from "./core";
import { type FrameToHostMessage, isFrameToHost, post, type ReadyItem } from "./protocol";
import type {
  ChangelogInfo,
  FrameSettings,
  NormalizedConfig,
  WidgetApi,
  WidgetCallbacks,
  WidgetConfig,
} from "./types";

export type HostWindow = Window &
  typeof globalThis & {
    HW_config?: WidgetConfig;
    FL_config?: WidgetConfig;
    Featherlog?: WidgetApi;
    Headway?: WidgetApi;
  };

export type WidgetInstance = {
  destroy(): void;
  show(): void;
  hide(): void;
  toggle(): void;
  unseen(): number;
  markAllSeen(): void;
};

const MAX_IDS = 100;
const WIDTH = 340;
const warn = (msg: string) => console.warn(`[Featherlog] ${msg}`);

export const CSS =
  "#HW_badge_cont{display:inline-block;position:relative;vertical-align:middle;line-height:0;cursor:pointer}" +
  "#HW_badge{display:none;box-sizing:border-box;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--fl-accent,#e5484d);color:#fff;font:700 11px/18px system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;text-align:center;letter-spacing:0;user-select:none;transition:transform .2s}" +
  "#HW_badge.HW_visible{display:inline-block}" +
  "#HW_badge.HW_softHidden{min-width:8px;width:8px;height:8px;padding:0;margin:5px;background:#c4c7cc;font-size:0}" +
  "#HW_badge:focus-visible{outline:2px solid var(--fl-accent,#e5484d);outline-offset:2px}" +
  "#HW_badge.HW_animated{animation:fl-pulse 2.4s ease-in-out infinite}" +
  "#HW_badge.fl-eye-2{animation-duration:1.6s}#HW_badge.fl-eye-3{animation:fl-pulse 1s ease-in-out infinite,fl-ring 1s ease-out infinite}" +
  "@keyframes fl-pulse{50%{transform:scale(1.18)}}" +
  "@keyframes fl-ring{0%{box-shadow:0 0 0 0 var(--fl-accent,#e5484d)}100%{box-shadow:0 0 0 8px transparent}}" +
  "#HW_frame_cont{position:fixed;z-index:2147483000;top:-9999px;left:-9999px;width:340px;height:460px;box-sizing:border-box;border-radius:10px;overflow:hidden;background:#fff;box-shadow:0 12px 40px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.08);opacity:0;visibility:hidden;transform:translateY(-6px);transition:opacity .16s,transform .16s,visibility 0s .16s}" +
  "#HW_frame_cont.HW_visible{opacity:1;visibility:visible;transform:none;transition:opacity .16s,transform .16s}" +
  "#HW_frame_cont iframe{display:block;width:100%;height:100%;border:0}" +
  "@media (prefers-color-scheme:dark){#HW_frame_cont{background:#1c1c1f}}" +
  "@media (prefers-reduced-motion:reduce){#HW_badge,#HW_frame_cont{transition:none!important;animation:none!important}}";

/** Finds the `src` of the script that loaded widget.js. */
export function detectScriptSrc(doc: Document): string {
  const cur = doc.currentScript as HTMLScriptElement | null;
  if (cur?.src) return cur.src;
  const scripts = doc.getElementsByTagName("script");
  for (let i = scripts.length - 1; i >= 0; i--) {
    const src = scripts[i]?.src ?? "";
    if (/\/widget\.js([?#]|$)/.test(src)) return src;
  }
  return "";
}

/** Merges defaults into a raw (Headway-compatible) config. Returns null when unusable. */
export function normalizeConfig(
  raw: WidgetConfig | undefined | null,
  ctx: { doc: Document; nav?: { language?: string }; scriptSrc?: string },
): NormalizedConfig | null {
  if (!raw || typeof raw !== "object" || !raw.account) {
    warn("missing `account` in config");
    return null;
  }
  let widgetUrl = (raw.widgetUrl || "").replace(/\/+$/, "");
  if (!widgetUrl && ctx.scriptSrc) {
    try {
      widgetUrl = new URL(ctx.scriptSrc).origin;
    } catch {
      /* ignore */
    }
  }
  if (!widgetUrl) {
    warn("cannot determine `widgetUrl`");
    return null;
  }
  return {
    account: String(raw.account),
    selector: raw.selector || "",
    trigger: raw.trigger || "",
    position: raw.position || {},
    translations: raw.translations,
    callbacks: raw.callbacks || {},
    embed: !!raw.embed,
    token: raw.token || "",
    language: raw.language || ctx.doc.documentElement.lang || ctx.nav?.language || "",
    widgetUrl,
  };
}

const el = (doc: Document, tag: string, attrs: Record<string, string>) => {
  const e = doc.createElement(tag);
  for (const k in attrs) e.setAttribute(k, attrs[k] as string);
  return e;
};

export function createWidget(
  cfg: NormalizedConfig,
  win: HostWindow,
  api: WidgetApi,
): WidgetInstance {
  const doc = win.document;
  const origin = new URL(cfg.widgetUrl).origin;
  const cleanups: (() => void)[] = [];
  const nodes: Element[] = [];
  const timers: ReturnType<typeof setTimeout>[] = [];
  const on = (t: EventTarget, ev: string, fn: (e: never) => void, opt?: boolean) => {
    t.addEventListener(ev, fn as EventListener, opt);
    cleanups.push(() => t.removeEventListener(ev, fn as EventListener, opt));
  };
  const key = (k: string) => `featherlog:${cfg.account}:${k}`;
  const load = (k: string): unknown => {
    try {
      return JSON.parse(win.localStorage.getItem(key(k)) || "null");
    } catch {
      return null;
    }
  };
  const loadIds = (k: string): string[] => {
    const v = load(k);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  };
  const save = (k: string, v: unknown) => {
    try {
      win.localStorage.setItem(key(k), JSON.stringify(v));
    } catch {
      /* storage unavailable */
    }
  };
  const addIds = (k: string, ids: string[]) => {
    const list = loadIds(k).filter((id) => !ids.includes(id));
    save(k, list.concat(ids).slice(-MAX_IDS));
  };
  const fire = <K extends keyof WidgetCallbacks>(
    name: K,
    ...args: Parameters<NonNullable<WidgetCallbacks[K]>>
  ) => {
    try {
      (cfg.callbacks[name] as ((...a: unknown[]) => void) | undefined)?.(...args);
    } catch (e) {
      console.error(e);
    }
  };

  let items: ReadyItem[] = [];
  let catNames: Record<string, string> = {};
  let settings: FrameSettings | null = null;
  let unseen = 0;
  let views = 0;
  let shown = false;
  let open = false;
  let height = 0;
  let raf = 0;
  let badge: HTMLElement | null = null;
  let badgeCont: HTMLElement | null = null;
  let cont: HTMLElement | null = null;
  let anchor: HTMLElement | null = null;

  const style = el(doc, "style", { id: "HW_styles_cont" });
  style.textContent = CSS;
  doc.head.appendChild(style);
  nodes.push(style);

  let target: Element | null = null;
  try {
    target = cfg.selector ? doc.querySelector(cfg.selector) : null;
  } catch {
    /* invalid selector */
  }
  if (!target && (cfg.selector || !cfg.trigger)) warn(`selector "${cfg.selector}" not found`);

  const params = new URLSearchParams();
  if (cfg.language) params.set("lang", cfg.language);
  if (cfg.token) params.set("token", cfg.token);
  if (cfg.embed) params.set("embed", "1");
  const qs = params.toString();
  const title = cfg.translations?.title || "Latest updates";
  const iframe = el(doc, "iframe", {
    src: `${cfg.widgetUrl}/_widget/${encodeURIComponent(cfg.account)}${qs ? `?${qs}` : ""}`,
    title,
    tabindex: "0",
  }) as HTMLIFrameElement;

  const render = () => {
    if (!badge || !shown || !settings) return;
    const soft = !unseen && settings.softHide;
    const eye = unseen ? settings.eyecatcher : "off";
    const tier = eye === "progressive" ? (views < 3 ? 1 : views < 6 ? 2 : 3) : 0;
    const cl = badge.classList;
    badge.textContent = unseen ? (unseen > 99 ? "99+" : String(unseen)) : "";
    badge.setAttribute("aria-label", unseen ? `${title} (${unseen})` : title);
    cl.toggle("HW_visible", unseen > 0 || soft);
    cl.toggle("HW_softHidden", soft);
    cl.toggle("HW_animated", eye !== "off");
    for (let i = 1; i <= 3; i++) cl.toggle(`fl-eye-${i}`, tier === i);
  };

  const markAllSeen = () => {
    if (items.length)
      addIds(
        "seen",
        items.map((i) => i.id),
      );
    unseen = 0;
    views = 0;
    save("views", 0);
    render();
  };

  const place = () => {
    if (!cont || !open) return;
    const vw = win.innerWidth;
    const vh = win.innerHeight;
    const w = Math.min(WIDTH, vw - 16);
    const max = Math.min(460, vh - 24);
    const h = Math.max(0, Math.min(height || max, max));
    const a = anchor || badge;
    const r = a
      ? a.getBoundingClientRect()
      : { top: 0, bottom: 0, left: (vw - w) / 2, right: (vw + w) / 2 };
    const rtl = (doc.documentElement.dir || doc.body.dir).toLowerCase() === "rtl";
    const p = computePosition(
      r,
      { width: w, height: h },
      { width: vw, height: vh },
      {
        ...cfg.position,
        rtl,
      },
    );
    const s = cont.style;
    s.top = `${p.top}px`;
    s.left = `${p.left}px`;
    s.width = `${w}px`;
    s.height = `${h}px`;
  };

  const schedule = () => {
    if (open && !raf)
      raf = win.requestAnimationFrame(() => {
        raf = 0;
        place();
      });
  };

  const show = () => {
    if (!cont || open) return;
    open = true;
    place();
    cont.classList.add("HW_visible");
    if (iframe.contentWindow) post(iframe.contentWindow, "opened", null, origin);
    markAllSeen();
    iframe.focus();
    fire("onShowWidget");
  };

  const hide = (focus?: boolean) => {
    if (!cont || !open) return;
    open = false;
    cont.classList.remove("HW_visible");
    if (iframe.contentWindow) post(iframe.contentWindow, "closed", null, origin);
    if (focus) (anchor || badge)?.focus();
    fire("onHideWidget");
  };

  const toggle = () => (open ? hide() : show());

  const info = (item: ReadyItem): ChangelogInfo => ({
    position: item.position,
    id: item.id,
    title: item.title,
    category: (catNames[item.categoryIds?.[0] ?? ""] || "").toLowerCase(),
  });

  const handle = (m: FrameToHostMessage) => {
    const fw = iframe.contentWindow;
    switch (m.type) {
      case "ready": {
        items = m.payload.items;
        settings = m.payload.settings;
        catNames = m.payload.categories || {};
        const seen = loadIds("seen");
        if (fw)
          post(
            fw,
            "init",
            {
              seen,
              read: loadIds("read"),
              translations: cfg.translations,
              locale: cfg.language,
            },
            origin,
          );
        unseen = computeUnseen(items, seen, settings.expireAfterDays ?? null, Date.now()).length;
        const v = Number(load("views")) || 0;
        views = unseen ? v + 1 : 0;
        save("views", views);
        if (badgeCont) badgeCont.style.setProperty("--fl-accent", settings.accentColor);
        if (cfg.embed) markAllSeen();
        timers.push(
          setTimeout(
            () => {
              shown = true;
              render();
            },
            Math.max(0, Number(settings.badgeDelay) || 0) * 1000,
          ),
        );
        fire("onWidgetReady", api);
        break;
      }
      case "setHeight":
        height = Math.max(0, m.payload.height);
        if (cfg.embed) iframe.style.height = `${Math.ceil(height)}px`;
        else place();
        break;
      case "showDetails":
        fire("onShowDetails", info(m.payload.item));
        break;
      case "readMore":
        fire("onReadMore", info(m.payload.item));
        break;
      case "markRead":
        addIds("read", [m.payload.id]);
        break;
      case "hide":
        hide(true);
        break;
    }
  };

  on(win, "message", (e: MessageEvent) => {
    if (e.origin === origin && e.source === iframe.contentWindow && isFrameToHost(e.data))
      handle(e.data);
  });

  if (cfg.embed) {
    if (target) {
      iframe.style.cssText = "display:block;width:100%;height:0;border:0";
      target.appendChild(iframe);
      nodes.push(iframe);
    }
  } else {
    if (target) {
      badgeCont = el(doc, "span", { id: "HW_badge_cont", class: "HW_badge_cont fl-badge-cont" });
      badge = el(doc, "span", {
        id: "HW_badge",
        class: "HW_badge fl-badge",
        role: "button",
        tabindex: "0",
        "aria-label": title,
      });
      badgeCont.appendChild(badge);
      target.appendChild(badgeCont);
      nodes.push(badgeCont);
      on(badgeCont, "click", () => {
        anchor = badge;
        toggle();
      });
      on(badge, "keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          anchor = badge;
          toggle();
        }
      });
    }
    cont = el(doc, "div", { id: "HW_frame_cont", role: "dialog", "aria-label": title });
    cont.appendChild(iframe);
    doc.body.appendChild(cont);
    nodes.push(cont);
    on(doc, "click", (e: MouseEvent) => {
      const t = e.target as Element | null;
      let trig: HTMLElement | null = null;
      try {
        trig = cfg.trigger && t?.closest ? (t.closest(cfg.trigger) as HTMLElement | null) : null;
      } catch {
        /* invalid selector */
      }
      if (trig && !badgeCont?.contains(t)) {
        anchor = badge || trig;
        toggle();
      } else if (open && t && !cont?.contains(t) && !badgeCont?.contains(t)) hide();
    });
    on(doc, "keydown", (e: KeyboardEvent) => {
      if (open && e.key === "Escape") hide(true);
    });
    on(win, "resize", schedule);
    on(win, "scroll", schedule, true);
  }

  return {
    destroy() {
      if (open) hide();
      for (const c of cleanups) c();
      for (const t of timers) clearTimeout(t);
      if (raf) win.cancelAnimationFrame(raf);
      for (const n of nodes) n.remove();
      cleanups.length = timers.length = nodes.length = 0;
    },
    show,
    hide: () => hide(),
    toggle,
    unseen: () => unseen,
    markAllSeen,
  };
}

/** Builds the public `window.Featherlog` / `window.Headway` API. */
export function createApi(win: HostWindow, scriptSrc?: string): WidgetApi {
  let inst: WidgetInstance | null = null;
  let pending: (() => void) | null = null;
  const doc = win.document;
  const api: WidgetApi = {
    init(config) {
      api.destroy();
      const run = () => {
        pending = null;
        const cfg = normalizeConfig(config || win.HW_config || win.FL_config, {
          doc,
          nav: win.navigator,
          scriptSrc,
        });
        if (!cfg) return;
        try {
          inst = createWidget(cfg, win, api);
        } catch (e) {
          console.error(e);
        }
      };
      if (doc.readyState === "loading") {
        pending = run;
        doc.addEventListener("DOMContentLoaded", run, { once: true });
      } else run();
    },
    destroy() {
      if (pending) doc.removeEventListener("DOMContentLoaded", pending);
      pending = null;
      inst?.destroy();
      inst = null;
    },
    show: () => inst?.show(),
    hide: () => inst?.hide(),
    toggle: () => inst?.toggle(),
    getUnseenCount: () => inst?.unseen() ?? 0,
    markAllSeen: () => inst?.markAllSeen(),
  };
  return api;
}

/** Initializes automatically once the DOM is ready when a config exists and `enabled !== false`. */
export function autoInit(api: WidgetApi, win: HostWindow): void {
  const go = () => {
    const raw = win.HW_config || win.FL_config;
    if (raw && raw.enabled !== false) api.init();
  };
  if (win.document.readyState === "loading")
    win.document.addEventListener("DOMContentLoaded", go, { once: true });
  else go();
}

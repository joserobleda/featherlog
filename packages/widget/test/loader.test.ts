import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { WidgetApi, WidgetConfig } from "../src/types";
import { autoInit, createApi, type HostWindow } from "../src/widget";
import { frameData } from "./fixtures";

const ORIGIN = "https://widget.test";
const win = window as HostWindow;
let frameWin: { postMessage: Mock };
const apis: WidgetApi[] = [];

const data = frameData();
const readyPayload = (settings: Partial<typeof data.settings> = {}) => ({
  items: data.items.map((i, position) => ({
    id: i.id,
    date: i.date,
    title: i.title,
    categoryIds: i.categoryIds,
    position,
  })),
  settings: { ...data.settings, ...settings },
  categories: { c1: "New", c2: "Fix" },
});

function fromFrame(
  type: string,
  payload: unknown,
  opts: { origin?: string; source?: unknown; envelope?: string } = {},
) {
  win.dispatchEvent(
    new MessageEvent("message", {
      data: { source: opts.envelope ?? "featherlog", v: 1, type, payload },
      origin: opts.origin ?? ORIGIN,
      source: ("source" in opts ? opts.source : frameWin) as MessageEventSource,
    }),
  );
}

const sent = (type: string) =>
  frameWin.postMessage.mock.calls.filter(([m]) => (m as { type: string }).type === type);

function setup(cfg: WidgetConfig = {}) {
  const api = createApi(win, `${ORIGIN}/widget.js`);
  apis.push(api);
  api.init({ account: "acc", selector: ".hw", ...cfg });
  return {
    api,
    badge: () => document.getElementById("HW_badge") as HTMLElement,
    cont: () => document.getElementById("HW_frame_cont") as HTMLElement,
  };
}

beforeEach(() => {
  frameWin = { postMessage: vi.fn() };
  vi.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockReturnValue(
    frameWin as unknown as Window,
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
  localStorage.clear();
  document.documentElement.lang = "en";
  document.body.innerHTML =
    '<div class="hw"></div><button id="trig" type="button">t</button><p id="out">out</p>';
});

afterEach(() => {
  for (const api of apis.splice(0)) api.destroy();
  document.head.innerHTML = "";
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("loader", () => {
  it("injects the badge into the selector and a hidden iframe", () => {
    const { api, badge, cont } = setup({ token: "t0k", translations: { title: "News" } });
    expect(document.querySelector(".hw #HW_badge_cont > #HW_badge")).toBe(badge());
    expect(badge().getAttribute("role")).toBe("button");
    expect(badge().getAttribute("tabindex")).toBe("0");
    expect(badge().classList.contains("HW_visible")).toBe(false);
    expect(cont().parentElement).toBe(document.body);
    expect(cont().getAttribute("role")).toBe("dialog");
    expect(cont().getAttribute("aria-label")).toBe("News");
    expect(cont().classList.contains("HW_visible")).toBe(false);
    const iframe = cont().querySelector("iframe") as HTMLIFrameElement;
    expect(iframe.getAttribute("src")).toBe(`${ORIGIN}/_widget/acc?lang=en&token=t0k`);
    expect(iframe.getAttribute("title")).toBe("News");
    expect(iframe.hasAttribute("allow")).toBe(false);
    expect(document.querySelectorAll("#HW_styles_cont")).toHaveLength(1);
    api.destroy();
  });

  it("omits empty query params and encodes the account", () => {
    document.documentElement.removeAttribute("lang");
    vi.spyOn(navigator, "language", "get").mockReturnValue("");
    setup({ account: "a/b c" });
    expect(document.querySelector("iframe")?.getAttribute("src")).toBe(
      `${ORIGIN}/_widget/a%2Fb%20c`,
    );
  });

  it("ignores messages from the wrong origin, source or envelope", () => {
    const { badge } = setup();
    fromFrame("ready", readyPayload(), { origin: "https://evil.test" });
    fromFrame("ready", readyPayload(), { source: window });
    fromFrame("ready", readyPayload(), { source: null });
    fromFrame("ready", readyPayload(), { envelope: "headway" });
    fromFrame("ready", { items: "nope" });
    expect(frameWin.postMessage).not.toHaveBeenCalled();
    expect(badge().classList.contains("HW_visible")).toBe(false);
  });

  it("shows the unseen count after badgeDelay and fires onWidgetReady", () => {
    vi.useFakeTimers();
    localStorage.setItem("featherlog:acc:read", JSON.stringify(["b"]));
    const onWidgetReady = vi.fn();
    const translations = { title: "Novedades", labels: { fix: "Arreglo" } };
    const { api, badge } = setup({ callbacks: { onWidgetReady }, translations, language: "es" });
    fromFrame("ready", readyPayload({ badgeDelay: 2, accentColor: "#123456" }));
    expect(sent("init")[0]?.[0]).toEqual({
      source: "featherlog",
      v: 1,
      type: "init",
      payload: { seen: [], read: ["b"], translations, locale: "es" },
    });
    expect(sent("init")[0]?.[1]).toBe(ORIGIN);
    expect(onWidgetReady).toHaveBeenCalledWith(api);
    expect(api.getUnseenCount()).toBe(2);
    vi.advanceTimersByTime(1999);
    expect(badge().classList.contains("HW_visible")).toBe(false);
    vi.advanceTimersByTime(1);
    expect(badge().classList.contains("HW_visible")).toBe(true);
    expect(badge().textContent).toBe("2");
    expect(
      (document.getElementById("HW_badge_cont") as HTMLElement).style.getPropertyValue(
        "--fl-accent",
      ),
    ).toBe("#123456");
  });

  it("only counts unseen, non-expired items", () => {
    vi.useFakeTimers({ now: new Date("2026-10-05T00:00:00Z") });
    localStorage.setItem("featherlog:acc:seen", JSON.stringify(["a"]));
    const { api, badge } = setup();
    fromFrame("ready", readyPayload({ expireAfterDays: 7 }));
    vi.runAllTimers();
    expect(api.getUnseenCount()).toBe(0);
    expect(badge().classList.contains("HW_visible")).toBe(false);
  });

  it("soft-hides the badge when there is nothing new", () => {
    localStorage.setItem("featherlog:acc:seen", JSON.stringify(["a", "b"]));
    vi.useFakeTimers();
    const { badge } = setup();
    fromFrame("ready", readyPayload({ softHide: true }));
    vi.runAllTimers();
    expect(badge().classList.contains("HW_visible")).toBe(true);
    expect(badge().classList.contains("HW_softHidden")).toBe(true);
    expect(badge().textContent).toBe("");
  });

  it("applies eyecatcher classes", () => {
    vi.useFakeTimers();
    const { badge } = setup();
    fromFrame("ready", readyPayload({ eyecatcher: "on" }));
    vi.runAllTimers();
    expect(badge().classList.contains("HW_animated")).toBe(true);
    expect(badge().classList.contains("fl-eye-1")).toBe(false);
  });

  it("grows progressive eyecatcher intensity with page views", () => {
    vi.useFakeTimers();
    const tiers: number[] = [];
    for (let i = 0; i < 7; i++) {
      for (const api of apis.splice(0)) api.destroy();
      const { badge } = setup();
      fromFrame("ready", readyPayload({ eyecatcher: "progressive" }));
      vi.runAllTimers();
      tiers.push([1, 2, 3].find((t) => badge().classList.contains(`fl-eye-${t}`)) ?? 0);
    }
    expect(tiers).toEqual([1, 1, 2, 2, 2, 3, 3]);
  });

  it("opens on badge click and closes on outside click", () => {
    vi.useFakeTimers();
    const onShowWidget = vi.fn();
    const onHideWidget = vi.fn();
    const { api, badge, cont } = setup({
      callbacks: { onShowWidget, onHideWidget },
      position: { y: "bottom" },
    });
    fromFrame("ready", readyPayload({ softHide: true }));
    vi.runAllTimers();
    fromFrame("setHeight", { height: 300 });
    badge().click();
    expect(cont().classList.contains("HW_visible")).toBe(true);
    expect(cont().style.height).toBe("300px");
    expect(cont().style.width).toBe("340px");
    expect(sent("opened")).toHaveLength(1);
    expect(onShowWidget).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem("featherlog:acc:seen") ?? "[]")).toEqual(["a", "b"]);
    expect(api.getUnseenCount()).toBe(0);
    expect(badge().classList.contains("HW_softHidden")).toBe(true);
    // clicks inside the badge or container don't close it
    cont().click();
    expect(cont().classList.contains("HW_visible")).toBe(true);
    (document.getElementById("out") as HTMLElement).click();
    expect(cont().classList.contains("HW_visible")).toBe(false);
    expect(sent("closed")).toHaveLength(1);
    expect(onHideWidget).toHaveBeenCalledTimes(1);
  });

  it("toggles with Enter/Space and closes with Escape returning focus to the badge", () => {
    const { badge, cont } = setup();
    badge().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(cont().classList.contains("HW_visible")).toBe(true);
    badge().dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(cont().classList.contains("HW_visible")).toBe(false);
    badge().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(cont().classList.contains("HW_visible")).toBe(false);
    expect(document.activeElement).toBe(badge());
  });

  it("closes on a `hide` message from the frame", () => {
    const { api, cont } = setup();
    api.show();
    expect(cont().classList.contains("HW_visible")).toBe(true);
    fromFrame("hide", null);
    expect(cont().classList.contains("HW_visible")).toBe(false);
  });

  it("positions the popover next to the badge", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1000);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);
    const { badge, cont } = setup();
    vi.spyOn(badge(), "getBoundingClientRect").mockReturnValue({
      top: 700,
      bottom: 718,
      left: 900,
      right: 918,
    } as DOMRect);
    fromFrame("setHeight", { height: 600 });
    badge().click();
    // max-height min(460, 800 - 24) = 460 → above, extending left
    expect(cont().style.height).toBe("460px");
    expect(cont().style.top).toBe(`${700 - 8 - 460}px`);
    expect(cont().style.left).toBe(`${918 - 340}px`);
  });

  it("supports an external trigger, even without a selector match", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { cont } = setup({ selector: ".missing", trigger: "#trig" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(document.getElementById("HW_badge")).toBeNull();
    (document.getElementById("trig") as HTMLElement).click();
    expect(cont().classList.contains("HW_visible")).toBe(true);
    (document.getElementById("trig") as HTMLElement).click();
    expect(cont().classList.contains("HW_visible")).toBe(false);
  });

  it("fires onShowDetails / onReadMore and persists markRead", () => {
    const onShowDetails = vi.fn();
    const onReadMore = vi.fn();
    setup({ callbacks: { onShowDetails, onReadMore } });
    fromFrame("ready", readyPayload());
    const item = readyPayload().items[1];
    fromFrame("showDetails", { item });
    fromFrame("readMore", { item });
    fromFrame("markRead", { id: "b" });
    const expected = { position: 1, id: "b", title: "Bug fixes", category: "fix" };
    expect(onShowDetails).toHaveBeenCalledWith(expected);
    expect(onReadMore).toHaveBeenCalledWith(expected);
    expect(JSON.parse(localStorage.getItem("featherlog:acc:read") ?? "[]")).toEqual(["b"]);
  });

  it("keeps at most 100 seen ids", () => {
    localStorage.setItem(
      "featherlog:acc:seen",
      JSON.stringify(Array.from({ length: 100 }, (_, i) => `old${i}`)),
    );
    const { api } = setup();
    fromFrame("ready", readyPayload());
    api.markAllSeen();
    const seen = JSON.parse(localStorage.getItem("featherlog:acc:seen") ?? "[]");
    expect(seen).toHaveLength(100);
    expect(seen.slice(-2)).toEqual(["a", "b"]);
    expect(seen[0]).toBe("old2");
  });

  it("renders inline in embed mode", () => {
    const { api } = setup({ embed: true });
    expect(document.getElementById("HW_badge")).toBeNull();
    expect(document.getElementById("HW_frame_cont")).toBeNull();
    const iframe = document.querySelector(".hw > iframe") as HTMLIFrameElement;
    expect(iframe.getAttribute("src")).toContain("embed=1");
    expect(iframe.style.width).toBe("100%");
    fromFrame("ready", readyPayload());
    fromFrame("setHeight", { height: 512.4 });
    expect(iframe.style.height).toBe("513px");
    expect(api.getUnseenCount()).toBe(0);
  });

  it("destroy removes everything and re-init leaves no duplicates", () => {
    const { api } = setup();
    api.init({ account: "acc", selector: ".hw" });
    api.init({ account: "acc", selector: ".hw" });
    expect(document.querySelectorAll("#HW_badge_cont")).toHaveLength(1);
    expect(document.querySelectorAll("#HW_frame_cont")).toHaveLength(1);
    expect(document.querySelectorAll("iframe")).toHaveLength(1);
    expect(document.querySelectorAll("#HW_styles_cont")).toHaveLength(1);
    api.destroy();
    expect(document.querySelector("#HW_badge_cont, #HW_frame_cont, iframe, #HW_styles_cont")).toBe(
      null,
    );
    fromFrame("ready", readyPayload());
    expect(frameWin.postMessage).not.toHaveBeenCalled();
    expect(api.getUnseenCount()).toBe(0);
    (document.getElementById("out") as HTMLElement).click();
  });

  it("does not throw when localStorage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const { api, badge } = setup();
    expect(() => {
      fromFrame("ready", readyPayload());
      fromFrame("markRead", { id: "a" });
      badge().click();
    }).not.toThrow();
    expect(sent("init")[0]?.[0]).toMatchObject({ payload: { seen: [], read: [] } });
    expect(api.getUnseenCount()).toBe(0);
  });

  it("isolates errors thrown by callbacks", () => {
    setup({
      callbacks: {
        onWidgetReady: () => {
          throw new Error("boom");
        },
      },
    });
    expect(() => fromFrame("ready", readyPayload())).not.toThrow();
  });

  it("auto-inits only when enabled !== false", () => {
    const api = createApi(win, `${ORIGIN}/widget.js`);
    win.HW_config = { account: "acc", selector: ".hw", enabled: false };
    autoInit(api, win);
    expect(document.querySelector("iframe")).toBeNull();
    win.HW_config = { account: "acc", selector: ".hw" };
    autoInit(api, win);
    expect(document.querySelector("iframe")).not.toBeNull();
    api.destroy();
    win.HW_config = undefined;
  });
});

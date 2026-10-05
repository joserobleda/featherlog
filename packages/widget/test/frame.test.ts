import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { type FrameApp, mountFrame, POWERED_BY_URL } from "../src/frame-app";
import type { HostToFrameMessage } from "../src/protocol";
import type { FrameData } from "../src/types";
import { frameData } from "./fixtures";

let root: HTMLElement;
let send: Mock;
let app: FrameApp | null = null;

const q = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T;
const qa = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
const types = () => send.mock.calls.map((c) => c[0]);
const init = (payload: Partial<Extract<HostToFrameMessage, { type: "init" }>["payload"]> = {}) =>
  app?.receive({
    source: "featherlog",
    v: 1,
    type: "init",
    payload: { seen: [], read: [], locale: "en", ...payload },
  });

function mount(data: FrameData = frameData(), embed = false) {
  app = mountFrame(root, data, { embed, send: send as never });
  return app;
}

beforeEach(() => {
  document.body.innerHTML = '<div id="fl-app"></div>';
  root = document.getElementById("fl-app") as HTMLElement;
  send = vi.fn();
});

afterEach(() => {
  app?.destroy();
  app = null;
  document.documentElement.className = "";
});

describe("frame list view", () => {
  it("renders header, items, footer and posts ready", () => {
    mount();
    expect(q("h1.fl-title").textContent).toBe("Latest updates");
    expect(q(".fl-close")).not.toBeNull();
    const items = qa(".fl-item");
    expect(items).toHaveLength(2);
    expect(items[0]?.tagName).toBe("BUTTON");
    expect(items[0]?.querySelector(".fl-item-title")?.textContent).toBe("Dark mode");
    expect(items[0]?.querySelector(".fl-excerpt")?.textContent).toBe("We shipped dark mode");
    expect(items[0]?.querySelector("time")?.textContent).toBe("Oct 1, 2026");
    const chips = items[1]?.querySelectorAll<HTMLElement>(".fl-chip") ?? [];
    expect(Array.from(chips, (c) => c.textContent)).toEqual(["Fix", "New"]);
    expect(chips[0]?.style.color).toBeTruthy();
    expect(qa(".fl-new")).toHaveLength(0); // unknown seen state until init
    const footer = q<HTMLAnchorElement>(".fl-footer-link");
    expect(footer.href).toBe("https://acme.test/changelog");
    expect(footer.target).toBe("_blank");
    expect(footer.textContent).toBe("View all updates");
    expect(q<HTMLAnchorElement>(".fl-powered").href).toBe(POWERED_BY_URL);
    expect(document.documentElement.dir).toBe("ltr");
    expect(document.documentElement.style.getPropertyValue("--fl-accent")).toBe("#ff0066");
    expect(send).toHaveBeenCalledWith("ready", {
      items: [
        {
          id: "a",
          date: "2026-10-01T10:00:00.000Z",
          title: "Dark mode",
          categoryIds: ["c1"],
          position: 0,
        },
        {
          id: "b",
          date: "2026-09-01T10:00:00.000Z",
          title: "Bug fixes",
          categoryIds: ["c2", "c1"],
          position: 1,
        },
      ],
      settings: frameData().settings,
      categories: { c1: "New", c2: "Fix" },
    });
  });

  it("marks unseen items after init", () => {
    mount();
    init({ seen: ["b"] });
    const items = qa(".fl-item");
    expect(items[0]?.querySelector(".fl-new")?.textContent).toBe("New");
    expect(items[1]?.querySelector(".fl-new")).toBeNull();
  });

  it("close button posts hide; Escape posts hide", () => {
    mount();
    q(".fl-close").click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(types().filter((t) => t === "hide")).toHaveLength(2);
  });

  it("hides the powered-by link when whitelabel", () => {
    const data = frameData();
    data.settings.whitelabel = true;
    mount(data);
    expect(q(".fl-powered")).toBeNull();
  });

  it("shows the empty state", () => {
    mount(frameData({ items: [] }));
    expect(q(".fl-empty").textContent).toBe("Nothing here yet");
    expect(q(".fl-list")).toBeNull();
  });

  it("applies translations from init", () => {
    mount();
    init({
      translations: {
        title: "Novedades",
        footer: "Ver todo",
        readMore: "Leer más",
        labels: { new: "Nuevo", FIX: "Arreglo" },
      },
    });
    expect(q("h1").textContent).toBe("Novedades");
    expect(q(".fl-footer-link").textContent).toBe("Ver todo");
    expect(qa(".fl-item")[1]?.querySelectorAll(".fl-chip")[0]?.textContent).toBe("Arreglo");
    expect(qa(".fl-item")[1]?.querySelectorAll(".fl-chip")[1]?.textContent).toBe("Nuevo");
    qa(".fl-item")[0]?.click();
    expect(q(".fl-readmore").textContent).toBe("Leer más");
  });

  it("posts setHeight via requestAnimationFrame", async () => {
    mount();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await new Promise((r) => setTimeout(r, 20));
    expect(types()).toContain("setHeight");
  });
});

describe("frame detail view", () => {
  it("opens details, posts showDetails + markRead, and goes back", () => {
    mount();
    const item = qa(".fl-item")[1] as HTMLElement;
    item.click();
    expect(root.className).toBe("fl-detail-view");
    expect(q(".fl-detail-title").textContent).toBe("Bug fixes");
    expect(q(".fl-content").innerHTML).toBe("<p>Fixes</p>");
    const more = q<HTMLAnchorElement>(".fl-readmore");
    expect(more.href).toBe("https://acme.test/changelog/bug-fixes");
    expect(more.target).toBe("_blank");
    const back = q(".fl-back");
    expect(back.textContent).toBe("Back");
    expect(document.activeElement).toBe(back);
    const pos1 = expect.objectContaining({ id: "b", position: 1 });
    expect(send).toHaveBeenCalledWith("showDetails", { item: pos1 });
    expect(send).toHaveBeenCalledWith("markRead", { id: "b" });
    more.addEventListener("click", (e) => e.preventDefault());
    more.click();
    expect(send).toHaveBeenCalledWith("readMore", { item: pos1 });
    back.click();
    expect(root.className).toBe("fl-list-view");
    expect(document.activeElement).toBe(qa(".fl-item")[1]);
  });

  it("returns to the list when the popover is closed", () => {
    mount();
    qa(".fl-item")[0]?.click();
    app?.receive({ source: "featherlog", v: 1, type: "closed", payload: null });
    expect(root.className).toBe("fl-list-view");
  });

  it("keeps the detail view when init arrives later", () => {
    mount();
    qa(".fl-item")[0]?.click();
    init({ seen: [] });
    expect(q(".fl-detail-title").textContent).toBe("Dark mode");
  });
});

describe("frame embed mode", () => {
  it("has no close button and Escape goes back from details", () => {
    mount(frameData(), true);
    expect(q(".fl-close")).toBeNull();
    expect(document.documentElement.classList.contains("fl-embed")).toBe(true);
    qa(".fl-item")[0]?.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(root.className).toBe("fl-list-view");
    expect(types()).not.toContain("hide");
  });
});

describe("frame entry", () => {
  it("mounts from window.__FL__ and only accepts messages from the parent", async () => {
    const w = window as Window & { __FL__?: FrameData };
    w.__FL__ = frameData({ dir: "rtl" });
    const postSpy = vi.spyOn(window, "postMessage").mockImplementation(() => {});
    vi.resetModules();
    await import("../src/frame");
    expect(document.documentElement.dir).toBe("rtl");
    expect(qa(".fl-item")).toHaveLength(2);
    expect(postSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "ready" }), "*");
    const msg = { source: "featherlog", v: 1, type: "init", payload: { seen: [], read: [] } };
    window.dispatchEvent(new MessageEvent("message", { data: msg, source: null }));
    expect(qa(".fl-new")).toHaveLength(0);
    window.dispatchEvent(
      new MessageEvent("message", { data: { ...msg, source: "x" }, source: window }),
    );
    expect(qa(".fl-new")).toHaveLength(0);
    window.dispatchEvent(new MessageEvent("message", { data: msg, source: window }));
    expect(qa(".fl-new")).toHaveLength(2);
    w.__FL__ = undefined;
    postSpy.mockRestore();
  });
});

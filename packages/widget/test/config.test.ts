import { afterEach, describe, expect, it, vi } from "vitest";
import { createApi, detectScriptSrc, type HostWindow, normalizeConfig } from "../src/widget";

const doc = document;

afterEach(() => {
  doc.documentElement.removeAttribute("lang");
  doc.head.innerHTML = "";
  doc.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("normalizeConfig", () => {
  it("returns null and warns without account", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(normalizeConfig(undefined, { doc })).toBeNull();
    expect(
      normalizeConfig({ selector: ".x" }, { doc, scriptSrc: "https://w.test/widget.js" }),
    ).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it("applies defaults", () => {
    const c = normalizeConfig(
      { account: "acc", selector: ".x" },
      { doc, nav: { language: "fr-FR" }, scriptSrc: "https://w.test/assets/widget.js?v=2" },
    );
    expect(c).toEqual({
      account: "acc",
      selector: ".x",
      trigger: "",
      position: {},
      translations: undefined,
      callbacks: {},
      embed: false,
      token: "",
      language: "fr-FR",
      widgetUrl: "https://w.test",
    });
  });

  it("prefers <html lang> over navigator.language, and explicit language over both", () => {
    doc.documentElement.lang = "de";
    const ctx = { doc, nav: { language: "fr" }, scriptSrc: "https://w.test/widget.js" };
    expect(normalizeConfig({ account: "a" }, ctx)?.language).toBe("de");
    expect(normalizeConfig({ account: "a", language: "es" }, ctx)?.language).toBe("es");
  });

  it("uses explicit widgetUrl (trailing slash stripped)", () => {
    const c = normalizeConfig(
      { account: "a", widgetUrl: "https://fl.example.com/base/" },
      { doc, scriptSrc: "https://other.test/widget.js" },
    );
    expect(c?.widgetUrl).toBe("https://fl.example.com/base");
  });

  it("returns null when widgetUrl cannot be determined", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(normalizeConfig({ account: "a" }, { doc })).toBeNull();
  });
});

describe("detectScriptSrc", () => {
  it("falls back to scanning scripts ending in /widget.js", () => {
    doc.head.innerHTML =
      '<script src="https://cdn.test/other.js"></script><script src="https://w.test/widget.js?x=1"></script>';
    expect(detectScriptSrc(doc)).toBe("https://w.test/widget.js?x=1");
  });
  it("returns empty string when not found", () => {
    expect(detectScriptSrc(doc)).toBe("");
  });
});

describe("global config aliases", () => {
  it("reads HW_config and FL_config", () => {
    doc.body.innerHTML = '<div class="hw"></div>';
    const win = window as HostWindow;
    const api = createApi(win, "https://w.test/widget.js");
    win.HW_config = { account: "hw-acc", selector: ".hw" };
    api.init();
    expect(doc.querySelector("iframe")?.getAttribute("src")).toContain("/_widget/hw-acc");
    win.HW_config = undefined;
    win.FL_config = { account: "fl-acc", selector: ".hw" };
    api.init();
    expect(doc.querySelectorAll("iframe")).toHaveLength(1);
    expect(doc.querySelector("iframe")?.getAttribute("src")).toContain("/_widget/fl-acc");
    win.FL_config = undefined;
    api.destroy();
  });
});

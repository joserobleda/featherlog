import { describe, expect, it, vi } from "vitest";
import { isEnvelope, isFrameToHost, isHostToFrame, post } from "../src/index";

const msg = (type: string, payload: unknown) => ({ source: "featherlog", v: 1, type, payload });

describe("protocol guards", () => {
  it("validates the envelope", () => {
    expect(isEnvelope(msg("hide", null))).toBe(true);
    expect(isEnvelope({ ...msg("hide", null), source: "other" })).toBe(false);
    expect(isEnvelope({ ...msg("hide", null), v: 2 })).toBe(false);
    expect(isEnvelope(null)).toBe(false);
    expect(isEnvelope("featherlog")).toBe(false);
  });

  it("validates frame→host messages", () => {
    expect(isFrameToHost(msg("ready", { items: [{ id: "a" }], settings: {} }))).toBe(true);
    expect(isFrameToHost(msg("ready", { items: [{}], settings: {} }))).toBe(false);
    expect(isFrameToHost(msg("ready", { items: [] }))).toBe(false);
    expect(isFrameToHost(msg("setHeight", { height: 120 }))).toBe(true);
    expect(isFrameToHost(msg("setHeight", { height: Number.NaN }))).toBe(false);
    expect(isFrameToHost(msg("setHeight", { height: "1" }))).toBe(false);
    expect(isFrameToHost(msg("showDetails", { item: { id: "a" } }))).toBe(true);
    expect(isFrameToHost(msg("readMore", {}))).toBe(false);
    expect(isFrameToHost(msg("markRead", { id: "a" }))).toBe(true);
    expect(isFrameToHost(msg("markRead", { id: 1 }))).toBe(false);
    expect(isFrameToHost(msg("hide", null))).toBe(true);
    expect(isFrameToHost(msg("init", { seen: [], read: [] }))).toBe(false);
    expect(isFrameToHost(msg("bogus", {}))).toBe(false);
  });

  it("validates host→frame messages", () => {
    expect(isHostToFrame(msg("init", { seen: ["a"], read: [], locale: "en" }))).toBe(true);
    expect(isHostToFrame(msg("init", { seen: [1], read: [] }))).toBe(false);
    expect(isHostToFrame(msg("opened", null))).toBe(true);
    expect(isHostToFrame(msg("closed", null))).toBe(true);
    expect(isHostToFrame(msg("hide", null))).toBe(false);
  });

  it("post wraps payloads in the envelope", () => {
    const target = { postMessage: vi.fn() };
    post(target, "setHeight", { height: 10 }, "*");
    expect(target.postMessage).toHaveBeenCalledWith(msg("setHeight", { height: 10 }), "*");
  });
});

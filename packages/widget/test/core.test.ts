import { describe, expect, it } from "vitest";
import { computePosition, computeUnseen } from "../src/index";

const DAY = 864e5;
const now = Date.parse("2026-10-05T00:00:00Z");
const items = [
  { id: "a", date: new Date(now - DAY).toISOString() },
  { id: "b", date: new Date(now - 10 * DAY).toISOString() },
  { id: "c", date: new Date(now - 40 * DAY).toISOString() },
];

describe("computeUnseen", () => {
  it("returns all items when nothing seen and no expiry", () => {
    expect(computeUnseen(items, [], null, now).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
  it("excludes seen items", () => {
    expect(computeUnseen(items, ["b"], null, now).map((i) => i.id)).toEqual(["a", "c"]);
  });
  it("excludes items older than expireAfterDays", () => {
    expect(computeUnseen(items, [], 30, now).map((i) => i.id)).toEqual(["a", "b"]);
    expect(computeUnseen(items, ["a"], 5, now)).toEqual([]);
  });
  it("treats expireAfterDays 0 as everything expired", () => {
    expect(computeUnseen(items, [], 0, now)).toEqual([]);
  });
  it("keeps items with unparsable dates", () => {
    expect(computeUnseen([{ id: "x", date: "nope" }], [], 30, now)).toHaveLength(1);
  });
});

describe("computePosition", () => {
  const vp = { width: 1000, height: 800 };
  const frame = { width: 340, height: 400 };
  const rect = (left: number, top: number, w = 18, h = 18) => ({
    left,
    top,
    right: left + w,
    bottom: top + h,
  });

  it("places below and extending right by default", () => {
    expect(computePosition(rect(100, 50), frame, vp)).toEqual({
      top: 76,
      left: 100,
      x: "right",
      y: "bottom",
    });
  });
  it("places above when there is no room below", () => {
    const p = computePosition(rect(100, 700), frame, vp);
    expect(p.y).toBe("top");
    expect(p.top).toBe(700 - 8 - 400);
  });
  it("extends left when there is no room on the right", () => {
    const p = computePosition(rect(900, 50), frame, vp);
    expect(p.x).toBe("left");
    expect(p.left).toBe(918 - 340);
  });
  it("prefers extending left in RTL", () => {
    const p = computePosition(rect(500, 50), frame, vp, { rtl: true });
    expect(p.x).toBe("left");
    expect(p.left).toBe(518 - 340);
  });
  it("falls back to right in RTL when no room on the left", () => {
    expect(computePosition(rect(50, 50), frame, vp, { rtl: true }).x).toBe("right");
  });
  it("respects forced positions", () => {
    const p = computePosition(rect(500, 300), frame, vp, { x: "left", y: "top" });
    expect(p).toMatchObject({ x: "left", y: "top", left: 518 - 340 });
  });
  it("clamps inside the viewport with 8px margin", () => {
    // forced right near the right edge
    const p = computePosition(rect(950, 10), frame, vp, { x: "right" });
    expect(p.left).toBe(1000 - 340 - 8);
    // forced top near the top edge
    const q = computePosition(rect(10, 10), frame, vp, { y: "top" });
    expect(q.top).toBe(8);
    expect(q.left).toBe(10);
  });
  it("clamps left edge", () => {
    const p = computePosition(rect(2, 50), frame, vp, { x: "left" });
    expect(p.left).toBe(8);
  });
  it("picks the side with more room when neither fits", () => {
    const small = { width: 400, height: 300 };
    const p = computePosition(rect(100, 200), frame, small);
    expect(p.y).toBe("top");
    expect(p.top).toBe(8);
    const q = computePosition(rect(100, 50), frame, small);
    expect(q.y).toBe("bottom");
    expect(q.top).toBe(8); // clamped: 300 - 400 - 8 < 8
  });
  it("uses margin when viewport narrower than frame", () => {
    const p = computePosition(rect(100, 50), frame, { width: 300, height: 800 });
    expect(p.left).toBe(8);
  });
});

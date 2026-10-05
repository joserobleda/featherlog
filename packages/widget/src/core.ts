const DAY = 864e5;

/** Items not in `seen` and (when `expireAfterDays` is set) newer than `now - expireAfterDays`. */
export function computeUnseen<T extends { id: string; date: string }>(
  items: readonly T[],
  seen: readonly string[],
  expireAfterDays: number | null,
  now: number,
): T[] {
  const s = new Set(seen);
  const min = expireAfterDays == null ? -Infinity : now - expireAfterDays * DAY;
  return items.filter((i) => !s.has(i.id) && !(Date.parse(i.date) < min));
}

export type Rect = { top: number; left: number; bottom: number; right: number };
export type Size = { width: number; height: number };
export type PositionOptions = {
  /** Force side: "right" = popover extends to the right of the badge, "left" = to the left. */
  x?: "left" | "right";
  /** Force side: "bottom" = below the badge, "top" = above. */
  y?: "top" | "bottom";
  rtl?: boolean;
  /** Minimum distance to the viewport edges (default 8). */
  margin?: number;
  /** Distance between badge and popover (default 8). */
  gap?: number;
};
export type Position = { top: number; left: number; x: "left" | "right"; y: "top" | "bottom" };

/** Computes the fixed position of the popover next to the badge, kept inside the viewport. */
export function computePosition(
  badge: Rect,
  frame: Size,
  viewport: Size,
  opts: PositionOptions = {},
): Position {
  const m = opts.margin ?? 8;
  const g = opts.gap ?? 8;
  const below = viewport.height - badge.bottom - g - m;
  const above = badge.top - g - m;
  const y =
    opts.y ??
    (below >= frame.height ? "bottom" : above >= frame.height || above > below ? "top" : "bottom");
  const toRight = viewport.width - badge.left - m; // room if left-aligned with badge, extending right
  const toLeft = badge.right - m; // room if right-aligned with badge, extending left
  const pref = opts.rtl ? "left" : "right";
  const other = opts.rtl ? "right" : "left";
  const room = (s: "left" | "right") => (s === "right" ? toRight : toLeft);
  const x =
    opts.x ??
    (room(pref) >= frame.width
      ? pref
      : room(other) >= frame.width || room(other) > room(pref)
        ? other
        : pref);
  let top = y === "bottom" ? badge.bottom + g : badge.top - g - frame.height;
  let left = x === "right" ? badge.left : badge.right - frame.width;
  const clamp = (v: number, size: number, max: number) => Math.max(m, Math.min(v, max - size - m));
  top = clamp(top, frame.height, viewport.height);
  left = clamp(left, frame.width, viewport.width);
  return { top, left, x, y };
}

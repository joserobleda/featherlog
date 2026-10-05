import type { FrameSettings, Translations } from "./types";

export const SOURCE = "featherlog";
export const VERSION = 1;

export type ReadyItem = {
  id: string;
  date: string;
  title: string;
  categoryIds: string[];
  position: number;
};

/** Messages sent from the iframe to the host page. */
export type FrameToHost = {
  ready: { items: ReadyItem[]; settings: FrameSettings; categories: Record<string, string> };
  setHeight: { height: number };
  showDetails: { item: ReadyItem };
  readMore: { item: ReadyItem };
  hide: null;
  markRead: { id: string };
};

/** Messages sent from the host page to the iframe. */
export type HostToFrame = {
  init: { seen: string[]; read: string[]; translations?: Translations; locale: string };
  opened: null;
  closed: null;
};

export type AllMessages = FrameToHost & HostToFrame;

export type Envelope<M, K extends keyof M = keyof M> = K extends keyof M
  ? { source: typeof SOURCE; v: typeof VERSION; type: K; payload: M[K] }
  : never;

export type FrameToHostMessage = Envelope<FrameToHost>;
export type HostToFrameMessage = Envelope<HostToFrame>;

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null;
const isStr = (x: unknown): x is string => typeof x === "string";
const isStrArr = (x: unknown): x is string[] => Array.isArray(x) && x.every(isStr);
const isItem = (x: unknown): boolean => isObj(x) && isStr(x.id);

/** Checks the envelope (`source`, `v`, string `type`). */
export function isEnvelope(
  d: unknown,
): d is { source: string; v: number; type: string; payload: unknown } {
  return isObj(d) && d.source === SOURCE && d.v === VERSION && isStr(d.type);
}

export function isFrameToHost(d: unknown): d is FrameToHostMessage {
  if (!isEnvelope(d)) return false;
  const p = d.payload as Obj;
  switch (d.type) {
    case "ready":
      return isObj(p) && Array.isArray(p.items) && p.items.every(isItem) && isObj(p.settings);
    case "setHeight":
      return isObj(p) && typeof p.height === "number" && Number.isFinite(p.height);
    case "showDetails":
    case "readMore":
      return isObj(p) && isItem(p.item);
    case "markRead":
      return isObj(p) && isStr(p.id);
    case "hide":
      return true;
  }
  return false;
}

export function isHostToFrame(d: unknown): d is HostToFrameMessage {
  if (!isEnvelope(d)) return false;
  const p = d.payload as Obj;
  switch (d.type) {
    case "init":
      return isObj(p) && isStrArr(p.seen) && isStrArr(p.read);
    case "opened":
    case "closed":
      return true;
  }
  return false;
}

/** Posts a protocol message to `target`. */
export function post<K extends keyof AllMessages>(
  target: { postMessage(message: unknown, targetOrigin: string): void },
  type: K,
  payload: AllMessages[K],
  origin: string,
): void {
  target.postMessage({ source: SOURCE, v: VERSION, type, payload }, origin);
}

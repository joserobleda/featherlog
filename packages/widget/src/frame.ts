import { mountFrame } from "./frame-app";
import { type AllMessages, isHostToFrame, post } from "./protocol";
import type { FrameData } from "./types";

const data = (window as Window & { __FL__?: FrameData }).__FL__;
const root = document.getElementById("fl-app");
if (data && root) {
  const app = mountFrame(root, data, {
    embed: new URLSearchParams(location.search).get("embed") === "1",
    send: (type, payload) => post(window.parent, type, payload as AllMessages[typeof type], "*"),
  });
  addEventListener("message", (e) => {
    if (e.source === window.parent && isHostToFrame(e.data)) app.receive(e.data);
  });
}

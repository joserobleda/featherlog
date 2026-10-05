import { autoInit, createApi, detectScriptSrc, type HostWindow } from "./widget";

const w = window as HostWindow;
w.Featherlog?.destroy();
const api = createApi(w, detectScriptSrc(document));
w.Featherlog = w.Headway = api;
autoInit(api, w);

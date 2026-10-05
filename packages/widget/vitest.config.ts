import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "widget",
    environment: "happy-dom",
    environmentOptions: {
      happyDOM: {
        settings: { disableIframePageLoading: true, disableJavaScriptFileLoading: true },
      },
    },
  },
});

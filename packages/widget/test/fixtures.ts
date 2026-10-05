import type { FrameData } from "../src/types";

export function frameData(over: Partial<FrameData> = {}): FrameData {
  return {
    v: 1,
    account: "acc",
    locale: "en",
    dir: "ltr",
    settings: {
      accentColor: "#ff0066",
      badgeDelay: 0,
      softHide: false,
      eyecatcher: "off",
      expireAfterDays: null,
      whitelabel: false,
    },
    strings: {
      title: "Latest updates",
      readMore: "Read more",
      footer: "View all updates",
      back: "Back",
      empty: "Nothing here yet",
      poweredBy: "Powered by Featherlog",
      newBadge: "New",
    },
    workspace: { name: "Acme", url: "https://acme.test/changelog", logoUrl: null },
    categories: {
      c1: { name: "New", color: "#0a0", textColor: "#fff", slug: "new" },
      c2: { name: "Fix", color: "#a00", textColor: "#fff", slug: "fix" },
    },
    items: [
      {
        id: "a",
        title: "Dark mode",
        date: "2026-10-01T10:00:00.000Z",
        excerpt: "We shipped dark mode",
        html: "<p>Full <strong>dark</strong> mode</p>",
        url: "https://acme.test/changelog/dark-mode",
        categoryIds: ["c1"],
      },
      {
        id: "b",
        title: "Bug fixes",
        date: "2026-09-01T10:00:00.000Z",
        excerpt: "Various fixes",
        html: "<p>Fixes</p>",
        url: "https://acme.test/changelog/bug-fixes",
        categoryIds: ["c2", "c1"],
      },
    ],
    ...over,
  };
}

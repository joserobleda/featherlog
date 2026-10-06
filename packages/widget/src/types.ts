export type FrameItem = {
  id: string;
  title: string;
  date: string /* ISO */;
  excerpt: string;
  html: string;
  url: string;
  categoryIds: string[];
};

export type FrameSettings = {
  accentColor: string;
  badgeDelay: number /* seconds */;
  softHide: boolean;
  eyecatcher: "off" | "on" | "progressive";
  /** Category chips and date above or below the title in the list (default above). */
  metaPosition?: "above" | "below";
  /** Footer pinned to the bottom of the popover instead of after the list. */
  stickyFooter?: boolean;
  expireAfterDays: number | null;
  whitelabel: boolean;
};

export type FrameData = {
  v: 1;
  account: string;
  locale: string;
  dir: "ltr" | "rtl";
  settings: FrameSettings;
  strings: {
    title: string;
    readMore: string;
    footer: string;
    back: string;
    empty: string;
    poweredBy: string;
    newBadge: string;
  };
  workspace: { name: string; url: string /* public changelog url */; logoUrl: string | null };
  categories: Record<string, { name: string; color: string; textColor: string; slug: string }>;
  items: FrameItem[];
};

/** Headway-compatible `translations` option. */
export type Translations = {
  title?: string;
  readMore?: string;
  footer?: string;
  /** Category label overrides keyed by lowercased category name or slug. */
  labels?: Record<string, string>;
};

/** Changelog descriptor passed to `onShowDetails` / `onReadMore` (Headway-compatible). */
export type ChangelogInfo = { position: number; id: string; title: string; category: string };

export type WidgetApi = {
  init(config?: WidgetConfig): void;
  destroy(): void;
  show(): void;
  hide(): void;
  toggle(): void;
  getUnseenCount(): number;
  markAllSeen(): void;
};

export type WidgetCallbacks = {
  onWidgetReady?: (widget: WidgetApi) => void;
  onShowWidget?: () => void;
  onShowDetails?: (changelog: ChangelogInfo) => void;
  onReadMore?: (changelog: ChangelogInfo) => void;
  onHideWidget?: () => void;
};

/** Config accepted from `window.HW_config` / `window.FL_config` / `init(config)`. */
export type WidgetConfig = {
  account?: string;
  selector?: string;
  enabled?: boolean;
  trigger?: string;
  position?: { x?: "left" | "right"; y?: "top" | "bottom" };
  translations?: Translations;
  callbacks?: WidgetCallbacks;
  embed?: boolean;
  token?: string;
  language?: string;
  widgetUrl?: string;
};

export type NormalizedConfig = {
  account: string;
  selector: string;
  trigger: string;
  position: { x?: "left" | "right"; y?: "top" | "bottom" };
  translations?: Translations;
  callbacks: WidgetCallbacks;
  embed: boolean;
  token: string;
  language: string;
  widgetUrl: string;
};

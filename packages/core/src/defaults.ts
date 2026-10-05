/** Default categories created with every workspace, named in each supported locale. */
export const DEFAULT_CATEGORIES: { color: string; names: Record<string, string> }[] = [
  {
    color: "#3778FF",
    names: {
      en: "New", es: "Nuevo", fr: "Nouveau", de: "Neu", it: "Novità", pt: "Novo", nl: "Nieuw",
      ca: "Nou", pl: "Nowość", sv: "Nytt", ja: "新機能", zh: "新功能", ko: "신규", ar: "جديد", he: "חדש",
    },
  },
  {
    color: "#9B51E0",
    names: {
      en: "Improvement", es: "Mejora", fr: "Amélioration", de: "Verbesserung", it: "Miglioramento",
      pt: "Melhoria", nl: "Verbetering", ca: "Millora", pl: "Ulepszenie", sv: "Förbättring",
      ja: "改善", zh: "改进", ko: "개선", ar: "تحسين", he: "שיפור",
    },
  },
  {
    color: "#EB5757",
    names: {
      en: "Fix", es: "Corrección", fr: "Correctif", de: "Fehlerbehebung", it: "Correzione",
      pt: "Correção", nl: "Oplossing", ca: "Correcció", pl: "Poprawka", sv: "Rättning",
      ja: "修正", zh: "修复", ko: "수정", ar: "إصلاح", he: "תיקון",
    },
  },
];

export const TERMINOLOGY = ["changelog", "release_notes", "changes", "updates", "news"] as const;
export type Terminology = (typeof TERMINOLOGY)[number];

/** Reserved slugs that would collide with app routes. */
export const RESERVED_SLUGS = new Set([
  "app", "api", "mcp", "login", "logout", "signup", "register", "invite", "auth", "admin",
  "settings", "docs", "static", "assets", "uploads", "widget", "widget.js", "_widget", "_next",
  "healthz", "robots.txt", "sitemap.xml", "favicon.ico", "consent", "oauth", "well-known",
  ".well-known", "new", "public", "featherlog", "www", "help", "support", "status", "blog",
]);

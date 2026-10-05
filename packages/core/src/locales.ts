export type LocaleInfo = { code: string; name: string; nativeName: string; dir: "ltr" | "rtl" };

/** Locales a workspace can publish in. Widget/public-page UI strings exist for all of them. */
export const LOCALES: LocaleInfo[] = [
  { code: "en", name: "English", nativeName: "English", dir: "ltr" },
  { code: "es", name: "Spanish", nativeName: "Español", dir: "ltr" },
  { code: "fr", name: "French", nativeName: "Français", dir: "ltr" },
  { code: "de", name: "German", nativeName: "Deutsch", dir: "ltr" },
  { code: "it", name: "Italian", nativeName: "Italiano", dir: "ltr" },
  { code: "pt", name: "Portuguese", nativeName: "Português", dir: "ltr" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands", dir: "ltr" },
  { code: "ca", name: "Catalan", nativeName: "Català", dir: "ltr" },
  { code: "pl", name: "Polish", nativeName: "Polski", dir: "ltr" },
  { code: "sv", name: "Swedish", nativeName: "Svenska", dir: "ltr" },
  { code: "ja", name: "Japanese", nativeName: "日本語", dir: "ltr" },
  { code: "zh", name: "Chinese", nativeName: "中文", dir: "ltr" },
  { code: "ko", name: "Korean", nativeName: "한국어", dir: "ltr" },
  { code: "ar", name: "Arabic", nativeName: "العربية", dir: "rtl" },
  { code: "he", name: "Hebrew", nativeName: "עברית", dir: "rtl" },
];

export const LOCALE_CODES = LOCALES.map((l) => l.code);
export const isLocale = (code: string) => LOCALE_CODES.includes(code);
export const localeInfo = (code: string) => LOCALES.find((l) => l.code === code);

/**
 * Picks the best locale among `available` for a requested language tag
 * ("es-MX" → "es"), falling back to `fallback`.
 */
export function negotiateLocale(
  requested: string | null | undefined,
  available: string[],
  fallback: string,
) {
  if (!requested) return fallback;
  for (const tag of requested.split(",")) {
    const code = tag.split(";")[0]?.trim().toLowerCase().split("-")[0];
    if (code && available.includes(code)) return code;
  }
  return fallback;
}

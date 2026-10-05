import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export const UI_LOCALES = ["en", "es"] as const;
export type UiLocale = (typeof UI_LOCALES)[number];
export const UI_LOCALE_COOKIE = "fl_ui_locale";

async function detect(): Promise<UiLocale> {
  const fromCookie = (await cookies()).get(UI_LOCALE_COOKIE)?.value;
  if (fromCookie && (UI_LOCALES as readonly string[]).includes(fromCookie))
    return fromCookie as UiLocale;
  const accept = (await headers()).get("accept-language") ?? "";
  for (const tag of accept.split(",")) {
    const code = tag.split(";")[0]?.trim().slice(0, 2).toLowerCase();
    if (code && (UI_LOCALES as readonly string[]).includes(code)) return code as UiLocale;
  }
  return "en";
}

export default getRequestConfig(async () => {
  const locale = await detect();
  const messages =
    locale === "es"
      ? (await import("../../messages/es")).default
      : (await import("../../messages/en")).default;
  return { locale, messages, timeZone: "UTC" };
});

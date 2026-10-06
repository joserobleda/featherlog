import "server-only";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  categoryName,
  categorySlug,
  findWorkspaceByPublicId,
  getPublicFeed,
  getWidgetSettings,
  listCategories,
  localeInfo,
  negotiateLocale,
} from "@featherlog/core";
import { categoryTextColor } from "@featherlog/markdown";
import type { FrameData } from "@featherlog/widget";
import { db } from "./db";
import { widgetStrings } from "./public-i18n";
import { listUrl, postUrl, withToken } from "./public-urls";
import { signPublicToken } from "./signed-links";

/** Shared cache headers for widget responses (HTML frame + JSON). */
export const WIDGET_CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=600";

/** Builds everything the widget iframe (or a headless client) needs, or null if the account is unknown. */
export async function buildFrameData(
  account: string,
  opts: { lang?: string | null; acceptLanguage?: string | null },
): Promise<FrameData | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(account)) return null;
  const ws = await findWorkspaceByPublicId(db, account);
  if (!ws) return null;
  const locale = negotiateLocale(opts.lang || opts.acceptLanguage, ws.locales, ws.defaultLocale);
  const settings = await getWidgetSettings(db, ws.id);
  const [cats, feed] = await Promise.all([
    listCategories(db, ws.id),
    getPublicFeed(db, ws, { locale, limit: settings.entriesLimit }),
  ]);
  const items = feed.items;
  const token = ws.privateMode ? signPublicToken(ws.id) : null;
  const overrides = settings.uiStrings?.[locale];

  return {
    v: 1,
    account: ws.publicId,
    locale,
    dir: localeInfo(locale)?.dir ?? "ltr",
    settings: {
      accentColor: settings.accentColor ?? ws.accentColor,
      badgeDelay: settings.badgeDelay,
      softHide: settings.softHide,
      eyecatcher: settings.eyecatcher as FrameData["settings"]["eyecatcher"],
      metaPosition: settings.metaPosition === "below" ? "below" : "above",
      stickyFooter: settings.stickyFooter,
      expireAfterDays: settings.expireAfterDays,
      whitelabel: ws.whitelabel,
    },
    strings: widgetStrings(locale, overrides),
    workspace: {
      name: ws.name,
      url: withToken(listUrl(ws, locale), token),
      logoUrl: ws.logoUrl,
    },
    categories: Object.fromEntries(
      cats.map((c) => [
        c.id,
        {
          name: categoryName(c, locale, ws.defaultLocale),
          color: c.color,
          textColor: categoryTextColor(c.color),
          slug: categorySlug(c, locale, ws.defaultLocale),
        },
      ]),
    ),
    items: items.map((p) => ({
      id: p.publicId,
      title: p.title,
      date: p.publishedAt.toISOString(),
      excerpt: p.excerpt,
      html: p.html,
      url: withToken(postUrl(ws, p, locale), token),
      categoryIds: p.categories.map((c) => c.id),
    })),
  };
}

let assetVersion: string | null = null;

/** Short content hash of the built frame assets, used as `?v=` cache buster. */
export function widgetAssetVersion() {
  if (assetVersion) return assetVersion;
  try {
    const h = createHash("sha256");
    for (const f of ["frame.js", "frame.css"]) {
      h.update(readFileSync(path.join(process.cwd(), "public", "widget", f)));
    }
    assetVersion = h.digest("hex").slice(0, 10);
  } catch {
    assetVersion = "0";
  }
  return assetVersion;
}

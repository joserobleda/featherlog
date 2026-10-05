import { publicPostPath, type Workspace } from "@featherlog/core";
import { publicUrl } from "./urls";

type WsRef = Pick<Workspace, "slug" | "defaultLocale">;

/** Path of a locale's list page relative to the workspace root ("" or "/es"). */
export function localePrefix(ws: Pick<Workspace, "defaultLocale">, locale: string) {
  return !locale || locale === ws.defaultLocale ? "" : `/${locale}`;
}

/** Absolute URL of the public changelog list in `locale` (default locale has no prefix). */
export function listUrl(ws: WsRef, locale: string = ws.defaultLocale) {
  return publicUrl(ws.slug, localePrefix(ws, locale));
}

/** Absolute URL of a post (`post.slug` should be the slug of the translation shown in `locale`). */
export function postUrl(
  ws: WsRef,
  post: { slug: string; publicId: string },
  locale: string = ws.defaultLocale,
) {
  return publicUrl(ws.slug, publicPostPath(ws, post, locale));
}

/** Absolute URL of the RSS feed in `locale`. */
export function rssUrl(ws: WsRef, locale: string = ws.defaultLocale) {
  return publicUrl(ws.slug, `/rss${localePrefix(ws, locale)}`);
}

export function sitemapUrl(ws: Pick<Workspace, "slug">) {
  return publicUrl(ws.slug, "/sitemap.xml");
}

/** Appends `?t=<token>` (private-mode access token) to a URL when a token is given. */
export function withToken(url: string, token: string | null | undefined) {
  if (!token) return url;
  return `${url}${url.includes("?") ? "&" : "?"}t=${encodeURIComponent(token)}`;
}

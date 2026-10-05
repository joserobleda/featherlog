import { findWorkspaceBySlug, getPublicFeed } from "@featherlog/core";
import { db } from "@/lib/db";
import { publicStrings, terminologyLabel } from "@/lib/public-i18n";
import { listUrl, postUrl, rssUrl } from "@/lib/public-urls";

export const dynamic = "force-dynamic";

const xml = (s: string) =>
  s
    // Strip characters that are invalid in XML 1.0.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(
      /[&<>"']/g,
      (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] as string,
    );

const cdata = (s: string) =>
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional
  `<![CDATA[${s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;

/** Category chips are emitted as `<category>` elements; drop the inline marker paragraph. */
const stripCategoryMarkers = (html: string) =>
  html.replace(/<p class="fl-categories">[\s\S]*?<\/p>\s*/g, "");

const notFound = () =>
  new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; lang?: string[] }> },
) {
  const { slug, lang = [] } = await params;
  const found = await findWorkspaceBySlug(db, slug);
  if (!found) return notFound();
  const ws = found.workspace;
  if (found.redirectedFrom) {
    const rest = lang.length ? `/${lang.map(encodeURIComponent).join("/")}` : "";
    return new Response(null, { status: 308, headers: { Location: `/${ws.slug}/rss${rest}` } });
  }
  if (ws.privateMode || lang.length > 1) return notFound();
  const requested = lang[0];
  if (requested && (requested === ws.defaultLocale || !ws.locales.includes(requested))) {
    return notFound();
  }
  const locale = requested ?? ws.defaultLocale;

  const feed = await getPublicFeed(db, ws, { locale, limit: 50 });
  const t = publicStrings(locale);
  const title = `${ws.name} ${terminologyLabel(ws.terminology, locale)}`;
  const self = rssUrl(ws, locale);
  const items = feed.items
    .map((p) => {
      const link = postUrl(ws, p, locale);
      return [
        "<item>",
        `<title>${xml(p.title)}</title>`,
        `<link>${xml(link)}</link>`,
        `<guid isPermaLink="false">${xml(p.publicId)}</guid>`,
        `<pubDate>${p.publishedAt.toUTCString()}</pubDate>`,
        ws.showAuthors && p.author ? `<dc:creator>${xml(p.author.name)}</dc:creator>` : "",
        ...p.categories.map((c) => `<category>${xml(c.name)}</category>`),
        `<description>${cdata(stripCategoryMarkers(p.html))}</description>`,
        "</item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
  const lastBuild = feed.items[0]?.publishedAt ?? new Date();
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
<title>${xml(title)}</title>
<link>${xml(listUrl(ws, locale))}</link>
<description>${xml(`${t.allUpdates} — ${ws.name}`)}</description>
<language>${xml(locale)}</language>
<lastBuildDate>${lastBuild.toUTCString()}</lastBuildDate>
<generator>Featherlog</generator>
<atom:link href="${xml(self)}" rel="self" type="application/rss+xml"/>
${ws.logoUrl && /^https?:\/\//.test(ws.logoUrl) ? `<image><url>${xml(ws.logoUrl)}</url><title>${xml(title)}</title><link>${xml(listUrl(ws, locale))}</link></image>\n` : ""}${items}
</channel>
</rss>
`;
  const headers: Record<string, string> = {
    "Content-Type": "application/rss+xml; charset=utf-8",
    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
  };
  if (ws.noindex) headers["X-Robots-Tag"] = "noindex";
  return new Response(body, { headers });
}

import { type Category, type Post, publicPostPath, type Workspace } from "@featherlog/core";
import { publicUrl } from "@/lib/urls";

export function serializePost(ws: Workspace, p: Post) {
  return {
    id: p.id,
    publicId: p.publicId,
    status: p.status,
    published: p.published,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    author: p.author ? { id: p.author.id, name: p.author.displayName || p.author.name } : null,
    createdVia: p.createdVia,
    actorLabel: p.actorLabel,
    version: p.version,
    categoryIds: p.categoryIds,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    translations: Object.fromEntries(
      Object.entries(p.translations).map(([locale, t]) => [
        locale,
        {
          title: t.title,
          slug: t.slug,
          contentMd: t.contentMd,
          contentHtml: t.contentHtml,
          excerpt: t.excerpt,
          url:
            p.status === "published"
              ? publicUrl(
                  ws.slug,
                  publicPostPath(ws, { slug: t.slug, publicId: p.publicId }, locale),
                )
              : null,
        },
      ]),
    ),
  };
}

export function serializeCategory(c: Category) {
  return { id: c.id, color: c.color, position: c.position, names: c.names };
}

export function serializeWorkspace(ws: Workspace) {
  return {
    id: ws.id,
    publicId: ws.publicId,
    slug: ws.slug,
    name: ws.name,
    url: publicUrl(ws.slug),
    websiteUrl: ws.websiteUrl,
    logoUrl: ws.logoUrl,
    accentColor: ws.accentColor,
    terminology: ws.terminology,
    defaultLocale: ws.defaultLocale,
    locales: ws.locales,
    missingTranslation: ws.missingTranslation,
    showAuthors: ws.showAuthors,
    noindex: ws.noindex,
    privateMode: ws.privateMode,
    whitelabel: ws.whitelabel,
    integrationsCanPublish: ws.integrationsCanPublish,
  };
}

export const etagOf = (p: { id: string; version: number }) => `W/"${p.id}-v${p.version}"`;

/** Parses `If-Match: W/"<id>-v<n>"` (or a bare version number) into the expected version. */
export function expectedVersionFrom(header: string | undefined): number | undefined {
  if (!header) return undefined;
  const m = /-v(\d+)"?$/.exec(header.trim()) ?? /^"?(\d+)"?$/.exec(header.trim());
  return m ? Number(m[1]) : undefined;
}

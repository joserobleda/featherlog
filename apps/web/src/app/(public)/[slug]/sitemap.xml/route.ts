import { findWorkspaceBySlug, listVisiblePostRefs } from "@featherlog/core";
import { postTranslations } from "@featherlog/db";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { listUrl, postUrl } from "@/lib/public-urls";

export const dynamic = "force-dynamic";

const xml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] as string,
  );

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await findWorkspaceBySlug(db, slug);
  if (!found) return new Response("Not found", { status: 404 });
  const ws = found.workspace;
  if (found.redirectedFrom) {
    return new Response(null, { status: 308, headers: { Location: `/${ws.slug}/sitemap.xml` } });
  }
  if (ws.noindex || ws.privateMode) return new Response("Not found", { status: 404 });

  const refs = await listVisiblePostRefs(db, ws);
  const translations = refs.length
    ? await db
        .select({
          postId: postTranslations.postId,
          locale: postTranslations.locale,
          slug: postTranslations.slug,
        })
        .from(postTranslations)
        .where(
          inArray(
            postTranslations.postId,
            refs.map((r) => r.id),
          ),
        )
    : [];

  const urls: string[] = [];
  const latest = refs[0]?.updatedAt ?? refs[0]?.publishedAt;
  for (const l of ws.locales) {
    urls.push(
      `<url><loc>${xml(listUrl(ws, l))}</loc>${latest ? `<lastmod>${latest.toISOString()}</lastmod>` : ""}</url>`,
    );
  }
  for (const r of refs) {
    const lastmod = (r.updatedAt ?? r.publishedAt)?.toISOString();
    for (const t of translations.filter(
      (x) => x.postId === r.id && ws.locales.includes(x.locale),
    )) {
      urls.push(
        `<url><loc>${xml(postUrl(ws, { slug: t.slug, publicId: r.publicId }, t.locale))}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`,
      );
    }
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}

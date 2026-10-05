import { getPublicFeed, getPublicPost, publicPostPath, type Workspace } from "@featherlog/core";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { publicStrings, terminologyLabel } from "@/lib/public-i18n";
import { listUrl, localePrefix, postUrl, rssUrl } from "@/lib/public-urls";
import { Entry } from "../_components/entry";
import { CategoryFilter, type LangLink, PublicShell } from "../_components/shell";
import {
  checkAccess,
  loadCategories,
  loadPostSlugs,
  loadWorkspace,
  one,
  orderedLocales,
  parsePublicPath,
  qs,
  wsPath,
} from "../_lib/data";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

type Props = {
  params: Promise<{ slug: string; path?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const loadFeed = cache(
  (ws: Workspace, locale: string, cursor: string | null, categorySlug: string | null) =>
    getPublicFeed(db, ws, { locale, cursor, categorySlug, limit: PAGE_SIZE }),
);

const loadPost = cache((ws: Workspace, publicId: string, locale: string) =>
  getPublicPost(db, ws, publicId, locale),
);

type Resolved =
  | { kind: "notFound" }
  | { kind: "redirect"; to: string }
  | { kind: "private"; ws: Workspace }
  | {
      kind: "list";
      ws: Workspace;
      locale: string;
      token: string | null;
      category: string | null;
      cursor: string | null;
      feed: Awaited<ReturnType<typeof getPublicFeed>>;
    }
  | {
      kind: "post";
      ws: Workspace;
      locale: string;
      token: string | null;
      post: NonNullable<Awaited<ReturnType<typeof getPublicPost>>>;
    };

async function resolve(props: Props): Promise<Resolved> {
  const { slug, path = [] } = await props.params;
  const sp = await props.searchParams;
  const query = { category: one(sp.category), cursor: one(sp.cursor), t: one(sp.t) };
  const found = await loadWorkspace(slug);
  if (!found) return { kind: "notFound" };
  const ws = found.workspace;
  if (found.redirectedFrom) {
    const rest = path.map((s) => `/${encodeURIComponent(s)}`).join("");
    return { kind: "redirect", to: wsPath(ws, rest) + qs(query) };
  }
  const parsed = parsePublicPath(ws, path);
  if (parsed.kind === "notFound") return parsed;
  if (parsed.kind === "redirect")
    return { kind: "redirect", to: wsPath(ws, parsed.to) + qs(query) };

  const access = await checkAccess(ws, query.t);
  if (!access.ok) return { kind: "private", ws };

  if (parsed.kind === "list") {
    const feed = await loadFeed(ws, parsed.locale, query.cursor, query.category);
    return {
      kind: "list",
      ws,
      locale: parsed.locale,
      token: access.token,
      category: query.category,
      cursor: query.cursor,
      feed,
    };
  }
  const post = await loadPost(ws, parsed.publicId, parsed.locale);
  if (!post) return { kind: "notFound" };
  if (post.slug !== parsed.slug) {
    return {
      kind: "redirect",
      to: wsPath(ws, publicPostPath(ws, post, parsed.locale)) + qs({ t: query.t }),
    };
  }
  return { kind: "post", ws, locale: parsed.locale, token: access.token, post };
}

function firstImage(html: string) {
  const m = /<img[^>]+src="(https?:\/\/[^"]+)"/i.exec(html);
  return m?.[1]?.replace(/&amp;/g, "&");
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const r = await resolve(props);
  if (r.kind === "notFound" || r.kind === "redirect") return {};
  const ws = r.ws;
  const hidden = ws.noindex || ws.privateMode;
  const robots = hidden ? { index: false, follow: false } : undefined;
  if (r.kind === "private") {
    return { title: { absolute: ws.name }, robots: { index: false, follow: false } };
  }
  const t = publicStrings(r.locale);
  const label = terminologyLabel(ws.terminology, r.locale);
  const siteName = `${ws.name} ${label}`;
  const rss = ws.privateMode
    ? undefined
    : { "application/rss+xml": [{ url: rssUrl(ws, r.locale), title: siteName }] };

  if (r.kind === "list") {
    const languages: Record<string, string> = {};
    for (const l of orderedLocales(ws)) languages[l] = listUrl(ws, l);
    languages["x-default"] = listUrl(ws);
    const canonical = listUrl(ws, r.locale) + qs({ category: r.category });
    const description = r.feed.items[0]?.excerpt || `${t.allUpdates} — ${ws.name}`;
    return {
      title: { absolute: r.feed.category ? `${r.feed.category.name} · ${siteName}` : siteName },
      description,
      robots,
      alternates: { canonical, languages, types: rss },
      openGraph: {
        type: "website",
        siteName,
        title: siteName,
        description,
        url: canonical,
        locale: r.locale,
        images: ws.logoUrl ? [{ url: ws.logoUrl }] : undefined,
      },
      twitter: { card: "summary", title: siteName, description },
    };
  }

  const post = r.post;
  const slugs = await loadPostSlugs(post.id);
  const locales =
    ws.missingTranslation === "hide"
      ? orderedLocales(ws).filter((l) => post.locales.includes(l))
      : orderedLocales(ws);
  const languages: Record<string, string> = {};
  for (const l of locales) {
    const slug = slugs[l] ?? slugs[ws.defaultLocale] ?? post.slug;
    languages[l] = postUrl(ws, { slug, publicId: post.publicId }, l);
  }
  const defaultLocale = locales.includes(ws.defaultLocale) ? ws.defaultLocale : locales[0];
  if (defaultLocale && languages[defaultLocale]) languages["x-default"] = languages[defaultLocale];
  const canonical = postUrl(ws, post, r.locale);
  const image = firstImage(post.html) ?? ws.logoUrl ?? undefined;
  const description = post.excerpt || undefined;
  return {
    title: { absolute: `${post.title} · ${ws.name}` },
    description,
    robots,
    alternates: { canonical, languages, types: rss },
    openGraph: {
      type: "article",
      siteName,
      title: post.title,
      description,
      url: canonical,
      locale: r.locale,
      publishedTime: post.publishedAt.toISOString(),
      authors: ws.showAuthors && post.author ? [post.author.name] : undefined,
      tags: post.categories.map((c) => c.name),
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image && image !== ws.logoUrl ? "summary_large_image" : "summary",
      title: post.title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function PublicPage(props: Props) {
  const r = await resolve(props);
  if (r.kind === "redirect") permanentRedirect(r.to);
  // Private workspaces without access also 404; not-found.tsx shows the "private" message.
  if (r.kind === "notFound" || r.kind === "private") notFound();

  const { ws, locale, token } = r;
  const t = publicStrings(locale);
  const home = wsPath(ws, localePrefix(ws, locale));
  const homeHref = home + qs({ t: token });

  if (r.kind === "post") {
    const post = r.post;
    const slugs = await loadPostSlugs(post.id);
    const langLinks: LangLink[] = orderedLocales(ws)
      .filter((l) => ws.missingTranslation !== "hide" || post.locales.includes(l))
      .map((l) => {
        const slug = slugs[l] ?? slugs[ws.defaultLocale] ?? post.slug;
        return {
          code: l,
          href:
            wsPath(ws, publicPostPath(ws, { slug, publicId: post.publicId }, l)) + qs({ t: token }),
        };
      });
    return (
      <PublicShell
        ws={ws}
        locale={locale}
        homeHref={homeHref}
        langLinks={langLinks}
        titleAsHeading={false}
      >
        <p className="pt-8">
          <a
            href={homeHref}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-fg-muted hover:text-[var(--fl-accent)]"
          >
            <span aria-hidden="true" className="rtl:rotate-180">
              ←
            </span>
            {t.allUpdates}
          </a>
        </p>
        <Entry
          ws={ws}
          post={post}
          locale={locale}
          href={postHref(ws, post, locale, token)}
          detail
        />
      </PublicShell>
    );
  }

  const { feed, category, cursor } = r;
  const categories = await loadCategories(ws.id);
  const langLinks: LangLink[] = orderedLocales(ws).map((l) => ({
    code: l,
    href: wsPath(ws, localePrefix(ws, l)) + qs({ t: token }),
  }));
  const hrefFor = (cat: string | null) => home + qs({ category: cat, t: token });
  return (
    <PublicShell ws={ws} locale={locale} homeHref={homeHref} langLinks={langLinks}>
      <CategoryFilter
        ws={ws}
        locale={locale}
        categories={categories}
        active={category}
        hrefFor={hrefFor}
      />
      {feed.items.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-lg font-semibold text-fg">
            {category ? t.noUpdatesCategory : t.noUpdates}
          </p>
          {!category && <p className="mt-2 text-fg-muted">{t.noUpdatesHint}</p>}
        </div>
      ) : (
        <div>
          {feed.items.map((post) => (
            <Entry
              key={post.id}
              ws={ws}
              post={post}
              locale={locale}
              href={postHref(ws, post, locale, token)}
            />
          ))}
        </div>
      )}
      {(cursor || feed.nextCursor) && (
        <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-8">
          {cursor ? (
            <a href={hrefFor(category)} className="text-sm font-medium text-fg-muted hover:text-fg">
              <span aria-hidden="true" className="inline-block rtl:rotate-180">
                ←
              </span>{" "}
              {t.newerUpdates}
            </a>
          ) : (
            <span />
          )}
          {feed.nextCursor && (
            <a
              href={home + qs({ category, cursor: feed.nextCursor, t: token })}
              rel="next"
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-fg hover:border-[var(--fl-accent)]"
            >
              {t.olderUpdates}
            </a>
          )}
        </nav>
      )}
      {!ws.privateMode && (
        <p className="pt-10 text-center text-sm">
          <a
            href={wsPath(ws, `/rss${localePrefix(ws, locale)}`)}
            className="inline-flex items-center gap-1.5 text-fg-muted hover:text-fg"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5" fill="currentColor">
              <circle cx="3" cy="13" r="2" />
              <path d="M1 6.5a8.5 8.5 0 0 1 8.5 8.5h-2A6.5 6.5 0 0 0 1 8.5zM1 1.5A13.5 13.5 0 0 1 14.5 15h-2A11.5 11.5 0 0 0 1 3.5z" />
            </svg>
            {t.rss}
          </a>
        </p>
      )}
    </PublicShell>
  );
}

function postHref(
  ws: Workspace,
  post: { slug: string; publicId: string },
  locale: string,
  token: string | null,
) {
  return wsPath(ws, publicPostPath(ws, post, locale)) + qs({ t: token });
}

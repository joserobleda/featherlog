import type { Category, Workspace } from "@featherlog/core";
import { categoryName, localeInfo } from "@featherlog/core";
import { categoryTextColor } from "@featherlog/markdown";
import type { CSSProperties, ReactNode } from "react";
import { publicStrings, terminologyLabel } from "@/lib/public-i18n";

export const GITHUB_URL = "https://github.com/joserobleda/featherlog";

export function accentStyle(ws: Pick<Workspace, "accentColor">): CSSProperties {
  return { "--fl-accent": ws.accentColor } as CSSProperties;
}

export function catStyle(color: string): CSSProperties {
  return { "--fl-cat": color, "--fl-cat-fg": categoryTextColor(color) } as CSSProperties;
}

function Logo({ ws }: { ws: Workspace }) {
  if (ws.logoUrl) {
    return (
      // biome-ignore lint/performance/noImgElement: external user-provided logo
      <img
        src={ws.logoUrl}
        alt=""
        width={40}
        height={40}
        className="size-10 shrink-0 rounded-lg object-contain"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="grid size-10 shrink-0 place-items-center rounded-lg text-lg font-bold"
      style={{ background: "var(--fl-accent)", color: categoryTextColor(ws.accentColor) }}
    >
      {ws.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export type LangLink = { code: string; href: string };

export function PublicShell({
  ws,
  locale,
  homeHref,
  langLinks = [],
  titleAsHeading = true,
  children,
}: {
  ws: Workspace;
  locale: string;
  homeHref: string;
  /** One per enabled locale (rendered only when there is more than one). */
  langLinks?: LangLink[];
  /** Render the workspace name as the page `<h1>` (list pages). */
  titleAsHeading?: boolean;
  children: ReactNode;
}) {
  const t = publicStrings(locale);
  const label = terminologyLabel(ws.terminology, locale);
  const Name = titleAsHeading ? "h1" : "p";
  return (
    <div style={accentStyle(ws)} className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-10 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
      >
        {t.allUpdates}
      </a>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-[760px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-5 sm:px-6">
          <a
            href={homeHref}
            className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--fl-accent)]"
          >
            <Logo ws={ws} />
            <span className="min-w-0">
              <Name className="truncate text-base font-semibold leading-tight text-fg">
                {ws.name}
              </Name>
              <span className="block text-sm text-fg-muted">{label}</span>
            </span>
          </a>
          <div className="ms-auto flex items-center gap-3 text-sm">
            {langLinks.length > 1 && (
              <nav aria-label={t.language} className="flex flex-wrap items-center gap-1">
                {langLinks.map((l) => {
                  const info = localeInfo(l.code);
                  const current = l.code === locale;
                  return (
                    <a
                      key={l.code}
                      href={l.href}
                      hrefLang={l.code}
                      lang={l.code}
                      aria-current={current ? "page" : undefined}
                      title={info?.name}
                      className={
                        current
                          ? "rounded-md bg-muted px-2 py-1 font-medium text-fg"
                          : "rounded-md px-2 py-1 text-fg-muted hover:bg-muted hover:text-fg"
                      }
                    >
                      {info?.nativeName ?? l.code}
                    </a>
                  );
                })}
              </nav>
            )}
            {ws.websiteUrl && (
              <a
                href={ws.websiteUrl}
                rel="noopener"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-fg-muted hover:bg-muted hover:text-fg"
              >
                {t.website}
                <span aria-hidden="true">↗</span>
              </a>
            )}
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[760px] flex-1 px-4 pb-16 sm:px-6">
        {children}
      </main>
      <PublicFooter ws={ws} locale={locale} />
    </div>
  );
}

function PublicFooter({ ws, locale }: { ws: Workspace; locale: string }) {
  if (ws.whitelabel) return null;
  const t = publicStrings(locale);
  return (
    <footer className="border-t border-border py-6 text-center text-sm text-fg-muted">
      <a href={GITHUB_URL} rel="noopener" className="hover:text-fg hover:underline">
        {t.poweredBy}
      </a>
    </footer>
  );
}

export function CategoryChip({ name, color }: { name: string; color: string }) {
  return (
    <span className="fl-category" style={catStyle(color)}>
      {name}
    </span>
  );
}

export function CategoryFilter({
  ws,
  locale,
  categories,
  active,
  hrefFor,
}: {
  ws: Workspace;
  locale: string;
  categories: Category[];
  active: string | null;
  hrefFor: (slug: string | null) => string;
}) {
  if (categories.length === 0) return null;
  const t = publicStrings(locale);
  const pill = (current: boolean) =>
    current
      ? "rounded-full border border-transparent bg-[var(--fl-accent)] px-3 py-1 text-sm font-medium"
      : "rounded-full border border-border bg-surface px-3 py-1 text-sm text-fg-muted hover:border-[var(--fl-accent)] hover:text-fg";
  const activeFg = { color: categoryTextColor(ws.accentColor) };
  return (
    <nav aria-label={t.filterLabel} className="flex flex-wrap gap-2 pt-6">
      <a
        href={hrefFor(null)}
        aria-current={!active ? "page" : undefined}
        className={pill(!active)}
        style={!active ? activeFg : undefined}
      >
        {t.filterAll}
      </a>
      {categories.map((c) => {
        const slug =
          c.slugs[locale] ?? c.slugs[ws.defaultLocale] ?? Object.values(c.slugs)[0] ?? "";
        const isActive = !!active && Object.values(c.slugs).includes(active);
        return (
          <a
            key={c.id}
            href={hrefFor(slug)}
            aria-current={isActive ? "page" : undefined}
            className={pill(isActive)}
            style={isActive ? activeFg : undefined}
          >
            <span
              aria-hidden="true"
              className="me-1.5 inline-block size-2 rounded-full align-middle"
              style={{ background: c.color }}
            />
            {categoryName(c, locale, ws.defaultLocale)}
          </a>
        );
      })}
    </nav>
  );
}

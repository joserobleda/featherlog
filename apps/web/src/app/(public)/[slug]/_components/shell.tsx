import type { Category, Workspace } from "@featherlog/core";
import { categoryName, localeInfo } from "@featherlog/core";
import { categoryTextColor } from "@featherlog/markdown";
import type { CSSProperties, ReactNode } from "react";
import { publicStrings, terminologyLabel } from "@/lib/public-i18n";
import { Dropdown, MenuLink } from "./dropdown";

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
  actions,
  children,
}: {
  ws: Workspace;
  locale: string;
  homeHref: string;
  /** One per enabled locale (rendered only when there is more than one). */
  langLinks?: LangLink[];
  /** Render the workspace name as the page `<h1>` (list pages). */
  titleAsHeading?: boolean;
  /** Extra header controls (e.g. the category filter on list pages). */
  actions?: ReactNode;
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
        <div className="mx-auto flex w-full max-w-[760px] items-center gap-x-3 px-4 py-5 sm:gap-x-4 sm:px-6">
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
          <div className="ms-auto flex shrink-0 items-center gap-1 text-sm">
            {actions}
            {langLinks.length > 1 && (
              <LanguageMenu locale={locale} links={langLinks} label={t.language} />
            )}
            {ws.websiteUrl && (
              <a
                href={ws.websiteUrl}
                rel="noopener"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-fg-muted hover:bg-muted hover:text-fg"
              >
                <span className="hidden sm:inline">{t.website}</span>
                <span className="sr-only sm:hidden">{t.website}</span>
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

const chevron = (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className="size-3.5 transition-transform group-open:rotate-180"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

/** Current language with a dropdown of the others. */
function LanguageMenu({
  locale,
  links,
  label,
}: {
  locale: string;
  links: LangLink[];
  label: string;
}) {
  const current = localeInfo(locale);
  return (
    <Dropdown
      label={`${label}: ${current?.nativeName ?? locale}`}
      summary={
        <>
          <span lang={locale}>{current?.nativeName ?? locale}</span>
          {chevron}
        </>
      }
    >
      {links.map((l) => (
        <MenuLink
          key={l.code}
          href={l.href}
          hrefLang={l.code}
          lang={l.code}
          current={l.code === locale}
        >
          {localeInfo(l.code)?.nativeName ?? l.code}
        </MenuLink>
      ))}
    </Dropdown>
  );
}

type FilterProps = {
  ws: Workspace;
  locale: string;
  categories: Category[];
  active: string | null;
  hrefFor: (slug: string | null) => string;
};

const slugOf = (c: Category, ws: Workspace, locale: string) =>
  c.slugs[locale] ?? c.slugs[ws.defaultLocale] ?? Object.values(c.slugs)[0] ?? "";

/** Compact filter icon (header) that opens the list of categories. */
export function CategoryMenu({ ws, locale, categories, active, hrefFor }: FilterProps) {
  if (categories.length === 0) return null;
  const t = publicStrings(locale);
  return (
    <Dropdown
      label={t.filterLabel}
      summary={
        <span className="relative inline-flex">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h18M7 12h10M10 18h4" />
          </svg>
          {active ? (
            <span
              aria-hidden="true"
              className="absolute -end-1 -top-1 size-2 rounded-full bg-[var(--fl-accent)]"
            />
          ) : null}
        </span>
      }
    >
      <p className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-fg-muted">{t.filterLabel}</p>
      <MenuLink href={hrefFor(null)} current={!active}>
        {t.filterAll}
      </MenuLink>
      {categories.map((c) => (
        <MenuLink
          key={c.id}
          href={hrefFor(slugOf(c, ws, locale))}
          current={!!active && Object.values(c.slugs).includes(active)}
        >
          <span
            aria-hidden="true"
            className="inline-block size-2 shrink-0 rounded-full"
            style={{ background: c.color }}
          />
          {categoryName(c, locale, ws.defaultLocale)}
        </MenuLink>
      ))}
    </Dropdown>
  );
}

/** When a category filter is active, a discreet chip above the list to clear it. */
export function ActiveCategory({ ws, locale, categories, active, hrefFor }: FilterProps) {
  const cat = active ? categories.find((c) => Object.values(c.slugs).includes(active)) : null;
  if (!cat) return null;
  const t = publicStrings(locale);
  return (
    <div className="flex items-center gap-2 pt-6 text-sm text-fg-muted">
      <a
        href={hrefFor(null)}
        title={t.filterAll}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface py-1 pe-2 ps-3 hover:border-[var(--fl-accent)] hover:text-fg"
      >
        <span
          aria-hidden="true"
          className="inline-block size-2 rounded-full"
          style={{ background: cat.color }}
        />
        {categoryName(cat, locale, ws.defaultLocale)}
        <span aria-hidden="true" className="ms-0.5 text-base leading-none">
          ×
        </span>
        <span className="sr-only">({t.filterAll})</span>
      </a>
    </div>
  );
}

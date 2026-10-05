"use client";
import { type ReactNode, useEffect, useRef } from "react";

/**
 * Small disclosure menu built on <details>, so it works without JavaScript; when JS is available it
 * also closes on outside click and Escape.
 */
export function Dropdown({
  summary,
  label,
  children,
  className = "",
}: {
  summary: ReactNode;
  /** Accessible name of the toggle (when `summary` is just an icon). */
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      if (el.open && !el.contains(e.target as Node)) el.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && el.open) {
        el.open = false;
        el.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <details ref={ref} className={`group relative ${className}`}>
      <summary
        aria-label={label}
        className="flex cursor-pointer list-none items-center gap-1 rounded-md px-2 py-1 text-fg-muted outline-none hover:bg-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-[var(--fl-accent)] group-open:bg-muted group-open:text-fg [&::-webkit-details-marker]:hidden"
      >
        {summary}
      </summary>
      <div className="absolute end-0 top-full z-20 mt-1 min-w-44 rounded-lg border border-border bg-surface p-1 shadow-lg">
        {children}
      </div>
    </details>
  );
}

export function MenuLink({
  href,
  current,
  children,
  hrefLang,
  lang,
}: {
  href: string;
  current?: boolean;
  children: ReactNode;
  hrefLang?: string;
  lang?: string;
}) {
  return (
    <a
      href={href}
      hrefLang={hrefLang}
      lang={lang}
      aria-current={current ? "page" : undefined}
      className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-muted ${
        current ? "font-medium text-fg" : "text-fg-muted hover:text-fg"
      }`}
    >
      {children}
      {current ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="ms-auto size-4 text-[var(--fl-accent)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : null}
    </a>
  );
}

import type { PublicPost, Workspace } from "@featherlog/core";
import { fmt, languageName, publicStrings } from "@/lib/public-i18n";
import { CategoryChip } from "./shell";

export function formatDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

export function formatDateTime(date: Date, locale: string) {
  const s = new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
  return `${s} UTC`;
}

function Author({ author }: { author: NonNullable<PublicPost["author"]> }) {
  return (
    <div className="mt-6 flex items-center gap-3">
      {author.image ? (
        // biome-ignore lint/performance/noImgElement: user avatar from arbitrary origin
        <img
          src={author.image}
          alt=""
          width={32}
          height={32}
          className="size-8 rounded-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="grid size-8 place-items-center rounded-full bg-muted text-sm font-semibold text-fg-muted"
        >
          {author.name.trim().charAt(0).toUpperCase()}
        </span>
      )}
      <div className="text-sm leading-tight">
        <div className="font-medium text-fg">{author.name}</div>
        {author.jobTitle && <div className="text-fg-muted">{author.jobTitle}</div>}
      </div>
    </div>
  );
}

export function Entry({
  ws,
  post,
  locale,
  href,
  detail = false,
}: {
  ws: Workspace;
  post: PublicPost;
  /** Locale of the page (may differ from `post.locale` when falling back). */
  locale: string;
  href: string;
  detail?: boolean;
}) {
  const t = publicStrings(locale);
  const Title = detail ? "h1" : "h2";
  const titleId = `post-${post.publicId}`;
  return (
    <article
      aria-labelledby={titleId}
      className="grid gap-3 border-b border-border py-10 last:border-b-0 sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-8"
    >
      <div className="sm:pt-1.5">
        <time
          dateTime={post.publishedAt.toISOString()}
          title={formatDateTime(post.publishedAt, locale)}
          className="text-sm text-fg-muted sm:sticky sm:top-6"
        >
          {formatDate(post.publishedAt, locale)}
        </time>
      </div>
      <div className="min-w-0">
        {post.categories.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {post.categories.map((c) => (
              <CategoryChip key={c.id} name={c.name} color={c.color} />
            ))}
          </div>
        )}
        <Title
          id={titleId}
          lang={post.isFallback ? post.locale : undefined}
          className={
            detail
              ? "text-3xl font-bold leading-tight tracking-tight text-fg"
              : "text-2xl font-bold leading-snug tracking-tight text-fg"
          }
        >
          {detail ? (
            post.title
          ) : (
            <a
              href={href}
              className="rounded hover:text-[var(--fl-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fl-accent)]"
            >
              {post.title}
            </a>
          )}
        </Title>
        {post.isFallback && (
          <p className="mt-2 text-sm italic text-fg-muted">
            {fmt(t.fallbackNotice, { language: languageName(post.locale, locale) })}
          </p>
        )}
        <div
          className="fl-prose mt-4 text-[15.5px] text-fg"
          lang={post.isFallback ? post.locale : undefined}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized at render time by @featherlog/markdown
          dangerouslySetInnerHTML={{ __html: post.html }}
        />
        {ws.showAuthors && post.author && <Author author={post.author} />}
      </div>
    </article>
  );
}

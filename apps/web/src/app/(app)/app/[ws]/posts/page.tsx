import {
  categoryName,
  countPostsByStatus,
  listCategories,
  listPosts,
  localeInfo,
  type Post,
  publicPostPath,
} from "@featherlog/core";
import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/panel/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge, CategoryChip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/session";
import { publicUrl } from "@/lib/urls";
import { cn } from "@/lib/utils";
import { PostFilters } from "./post-filters";

export const metadata = { title: "Posts" };

const STATUSES = ["all", "in_review", "draft", "scheduled", "published"] as const;
type Status = (typeof STATUSES)[number];

export default async function PostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string }>;
  searchParams: Promise<{
    status?: string;
    locale?: string;
    missing?: string;
    q?: string;
    cursor?: string;
  }>;
}) {
  const { ws: slug } = await params;
  const sp = await searchParams;
  const { workspace, ctx } = await getWorkspaceContext(slug);
  const t = await getTranslations("posts");
  const format = await getFormatter();
  const status: Status = STATUSES.includes(sp.status as Status) ? (sp.status as Status) : "all";
  const [counts, page, cats] = await Promise.all([
    countPostsByStatus(ctx),
    listPosts(ctx, {
      status,
      locale: sp.locale || undefined,
      missingLocale: sp.missing || undefined,
      q: sp.q || undefined,
      cursor: sp.cursor,
      limit: 25,
    }),
    listCategories(db, workspace.id),
  ]);
  const base = `/app/${workspace.slug}/posts`;
  const qs = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({
      status,
      locale: sp.locale,
      missing: sp.missing,
      q: sp.q,
      ...patch,
    })) {
      if (v && !(k === "status" && v === "all")) next.set(k, v);
    }
    const s = next.toString();
    return s ? `${base}?${s}` : base;
  };
  const filtered = Boolean(sp.q || sp.locale || sp.missing || status !== "all");
  const multiLocale = workspace.locales.length > 1;

  const titleOf = (p: Post) =>
    p.translations[workspace.defaultLocale]?.title ??
    Object.values(p.translations)[0]?.title ??
    t("untitled");

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button asChild>
            <Link href={`${base}/new`}>
              <Plus /> {t("new")}
            </Link>
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-1 rounded-lg bg-muted p-1" aria-label="Status">
          {STATUSES.filter((s) => s !== "in_review" || counts.in_review > 0 || status === s).map(
            (s) => (
              <Link
                key={s}
                href={qs({ status: s, cursor: undefined })}
                className={cn(
                  "rounded-md px-3 py-1 text-sm text-fg-muted hover:text-fg",
                  s === status && "bg-surface font-medium text-fg shadow-xs",
                )}
                aria-current={s === status ? "page" : undefined}
              >
                {t(`tabs.${s}`)}{" "}
                <span
                  className={cn(
                    "ml-1 text-xs text-fg-muted",
                    s === "in_review" &&
                      counts.in_review > 0 &&
                      "rounded-full bg-amber-500/15 px-1.5 font-semibold text-amber-700 dark:text-amber-400",
                  )}
                >
                  {counts[s]}
                </span>
              </Link>
            ),
          )}
        </nav>
        <PostFilters
          locales={workspace.locales.map((code) => ({
            code,
            name: localeInfo(code)?.nativeName ?? code,
          }))}
          multiLocale={multiLocale}
        />
      </div>

      {page.items.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title={filtered ? t("emptyFiltered") : t("empty")}
          description={filtered ? undefined : t("emptyDescription")}
          action={
            filtered ? null : (
              <Button asChild>
                <Link href={`${base}/new`}>
                  <Plus /> {t("new")}
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {page.items.map((p) => {
            const date = p.publishedAt ?? p.createdAt;
            const tr = p.translations[workspace.defaultLocale] ?? Object.values(p.translations)[0];
            return (
              <li
                key={p.id}
                className="group relative flex items-start gap-4 px-5 py-4 hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`${base}/${p.id}`}
                      className="font-medium after:absolute after:inset-0 hover:underline"
                    >
                      {titleOf(p)}
                    </Link>
                    <StatusBadge status={p.status} label={t(`status.${p.status}`)} />
                    {p.categoryIds.map((id) => {
                      const c = cats.find((x) => x.id === id);
                      return c ? (
                        <CategoryChip
                          key={id}
                          name={categoryName(c, workspace.defaultLocale, workspace.defaultLocale)}
                          color={c.color}
                          className="text-[11px]"
                        />
                      ) : null;
                    })}
                  </div>
                  {tr?.excerpt ? (
                    <p className="mt-1 line-clamp-1 text-sm text-fg-muted">{tr.excerpt}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
                    <time
                      dateTime={date.toISOString()}
                      title={format.dateTime(date, { dateStyle: "full", timeStyle: "short" })}
                    >
                      {p.status === "in_review" && p.review
                        ? t("sentToReview", {
                            date: format.dateTime(p.review.requestedAt, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }),
                          })
                        : p.status === "scheduled"
                          ? t("scheduledFor", {
                              date: format.dateTime(date, {
                                dateStyle: "medium",
                                timeStyle: "short",
                              }),
                            })
                          : format.dateTime(date, { dateStyle: "medium" })}
                    </time>
                    {p.author ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Avatar
                          name={p.author.displayName || p.author.name}
                          image={p.author.image}
                          size={16}
                        />
                        {p.author.displayName || p.author.name}
                      </span>
                    ) : null}
                    {p.createdVia !== "panel" ? (
                      <Badge tone="brand" className="py-0 text-[11px]">
                        {t(`via.${p.createdVia as "api" | "mcp"}`)}
                        {p.actorLabel ? ` · ${p.actorLabel}` : ""}
                      </Badge>
                    ) : null}
                    {multiLocale ? (
                      <span className="inline-flex gap-1">
                        {workspace.locales.map((code) => (
                          <span
                            key={code}
                            title={
                              p.translations[code]
                                ? localeInfo(code)?.name
                                : t("missingIn", { language: localeInfo(code)?.name ?? code })
                            }
                            className={cn(
                              "rounded px-1 font-mono text-[10px] uppercase",
                              p.translations[code]
                                ? "bg-muted text-fg"
                                : "border border-dashed border-border text-fg-muted/60 line-through",
                            )}
                          >
                            {code}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </div>
                </div>
                {p.status === "published" && tr ? (
                  <a
                    href={publicUrl(
                      workspace.slug,
                      publicPostPath(
                        workspace,
                        { slug: tr.slug, publicId: p.publicId },
                        workspace.defaultLocale,
                      ),
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="relative z-10 hidden text-xs text-fg-muted hover:text-brand group-hover:inline"
                  >
                    ↗
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {page.nextCursor ? (
        <div className="mt-4 flex justify-center">
          <Button asChild variant="secondary">
            <Link href={qs({ cursor: page.nextCursor })}>{t("loadMore")}</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function StatusBadge({ status, label }: { status: Post["status"]; label: string }) {
  const tone =
    status === "published"
      ? "success"
      : status === "in_review"
        ? "warning"
        : status === "scheduled"
          ? "brand"
          : "neutral";
  return <Badge tone={tone}>{label}</Badge>;
}

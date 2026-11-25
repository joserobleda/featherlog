import {
  countSubscribers,
  listSubscribers,
  localeInfo,
  SUBSCRIBER_STATUSES,
} from "@featherlog/core";
import { Mail } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/panel/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { getSettingsContext } from "../_lib/guard";
import { ImportDialog } from "./import-dialog";
import { SubscriberList, SubscriberSearch } from "./subscriber-list";

export async function generateMetadata() {
  const t = await getTranslations("settings.subscribers");
  return { title: t("title") };
}

const TABS = ["all", ...SUBSCRIBER_STATUSES] as const;
type Tab = (typeof TABS)[number];

export default async function SubscribersPage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string }>;
  searchParams: Promise<{ status?: string; q?: string; cursor?: string }>;
}) {
  const { ws } = await params;
  const sp = await searchParams;
  const { ctx, workspace } = await getSettingsContext(ws);
  const t = await getTranslations("settings.subscribers");
  const status: Tab = TABS.includes(sp.status as Tab) ? (sp.status as Tab) : "all";
  const [counts, page] = await Promise.all([
    countSubscribers(ctx),
    listSubscribers(ctx, { status, q: sp.q || undefined, cursor: sp.cursor, limit: 50 }),
  ]);
  const base = `/app/${workspace.slug}/settings/subscribers`;
  const qs = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ status, q: sp.q, ...patch }))
      if (v && !(k === "status" && v === "all")) next.set(k, v);
    const s = next.toString();
    return s ? `${base}?${s}` : base;
  };
  const filtered = Boolean(sp.q || status !== "all");

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={<ImportDialog wsSlug={workspace.slug} />}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-1 rounded-lg bg-muted p-1" aria-label="Status">
          {TABS.filter((s) => s !== "bounced" || counts.bounced > 0 || status === s).map((s) => (
            <Link
              key={s}
              href={qs({ status: s, cursor: undefined })}
              className={cn(
                "rounded-md px-3 py-1 text-sm text-fg-muted hover:text-fg",
                s === status && "bg-surface font-medium text-fg shadow-xs",
              )}
              aria-current={s === status ? "page" : undefined}
            >
              {t(`tabs.${s}`)} <span className="ml-1 text-xs text-fg-muted">{counts[s]}</span>
            </Link>
          ))}
        </nav>
        <SubscriberSearch placeholder={t("search")} />
      </div>
      {page.items.length === 0 ? (
        <EmptyState
          icon={<Mail />}
          title={filtered ? t("emptyFiltered") : t("empty")}
          description={filtered ? undefined : t("emptyDescription")}
          action={
            filtered ? null : (
              <Button asChild variant="secondary">
                <Link href={`/app/${workspace.slug}/settings/api`}>{t("apiLink")}</Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          <SubscriberList
            wsSlug={workspace.slug}
            items={page.items.map((s) => ({
              id: s.id,
              email: s.email,
              name: s.name,
              externalId: s.externalId,
              language: s.locale ? (localeInfo(s.locale)?.nativeName ?? s.locale) : null,
              status: s.status as (typeof SUBSCRIBER_STATUSES)[number],
              source: s.source,
              createdAt: s.createdAt.toISOString(),
              unsubscribedAt: s.unsubscribedAt?.toISOString() ?? null,
            }))}
          />
          <div className="mt-4 flex justify-end gap-2">
            {sp.cursor ? (
              <Button asChild variant="ghost">
                <Link href={qs({ cursor: undefined })}>{t("first")}</Link>
              </Button>
            ) : null}
            {page.nextCursor ? (
              <Button asChild variant="secondary">
                <Link href={qs({ cursor: page.nextCursor })}>{t("next")}</Link>
              </Button>
            ) : null}
          </div>
        </>
      )}
    </>
  );
}

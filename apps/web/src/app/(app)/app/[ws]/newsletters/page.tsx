import { countRecipients, listCandidatePosts, listNewsletters } from "@featherlog/core";
import { Newspaper, Settings2, Users } from "lucide-react";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/panel/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { env } from "@/lib/env";
import { getNewsletterContext } from "./guard";
import { NewNewsletterButton } from "./new-button";
import { STATUS_TONE } from "./status";

export async function generateMetadata() {
  const t = await getTranslations("newsletters");
  return { title: t("title") };
}

export default async function NewslettersPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const { ctx, workspace } = await getNewsletterContext(ws);
  const t = await getTranslations("newsletters");
  const format = await getFormatter();
  const [items, candidates, recipients] = await Promise.all([
    listNewsletters(ctx),
    listCandidatePosts(ctx),
    countRecipients(ctx),
  ]);
  const base = `/app/${workspace.slug}/newsletters`;
  const date = (d: Date) => format.dateTime(d, { dateStyle: "medium" });

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button asChild variant="secondary">
            <Link href={`${base}/settings`}>
              <Settings2 /> {t("settings")}
            </Link>
          </Button>
        }
      />
      <div className="mb-6 grid gap-3 rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <p className="text-sm font-medium">{t("pending", { count: candidates.length })}</p>
            <p className="flex items-center gap-1.5 text-[13px] text-fg-muted">
              <Users className="size-3.5" />
              <Link
                href={`/app/${workspace.slug}/settings/subscribers`}
                className="hover:underline"
              >
                {t("subscribers", { count: recipients })}
              </Link>
            </p>
          </div>
          <NewNewsletterButton wsSlug={workspace.slug} disabled={candidates.length === 0} />
        </div>
        <p className="text-[13px] text-fg-muted">{env.aiEnabled ? t("aiOn") : t("aiOff")}</p>
        {env.emailEnabled ? null : (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[13px] text-amber-700 dark:text-amber-400">
            {t("noSmtp")}
          </p>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState icon={<Newspaper />} title={t("empty")} description={t("emptyDescription")} />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {items.map((n) => {
            const tr =
              n.translations[workspace.defaultLocale] ?? Object.values(n.translations)[0] ?? null;
            return (
              <li key={n.id}>
                <Link
                  href={`${base}/${n.id}`}
                  className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-muted/50 sm:flex-nowrap"
                >
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {tr?.subject || t("untitled")}
                      </span>
                      <Badge tone={STATUS_TONE[n.status]}>{t(`status.${n.status}`)}</Badge>
                    </div>
                    <span className="truncate text-[13px] text-fg-muted">
                      {[
                        t("postsCount", { count: n.posts.length }),
                        n.sentAt
                          ? t("sentOn", { date: date(n.sentAt) })
                          : t("createdOn", { date: date(n.createdAt) }),
                        n.status === "sent" || n.status === "sending"
                          ? t("sentStats", { sent: n.sentCount, recipients: n.recipients })
                          : null,
                        n.failedCount ? t("failedStats", { count: n.failedCount }) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

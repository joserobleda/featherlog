import {
  countNewsletterRecipients,
  getNewsletter,
  getPost,
  isAppError,
  localeInfo,
  newsletterReadStats,
} from "@featherlog/core";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { env } from "@/lib/env";
import { postUrl } from "@/lib/public-urls";
import { getNewsletterContext } from "../guard";
import { STATUS_TONE } from "../status";
import { NewsletterView } from "./newsletter-view";

export async function generateMetadata() {
  const t = await getTranslations("newsletters");
  return { title: t("title") };
}

export default async function NewsletterPage({
  params,
}: {
  params: Promise<{ ws: string; id: string }>;
}) {
  const { ws, id } = await params;
  const { ctx, workspace } = await getNewsletterContext(ws);
  const nl = await getNewsletter(ctx, id).catch((e) => {
    if (isAppError(e) && e.code === "not_found") notFound();
    throw e;
  });
  const t = await getTranslations("newsletters");
  const format = await getFormatter();
  const [posts, audience, reads] = await Promise.all([
    Promise.all(nl.posts.map((p) => getPost(ctx, p.postId).catch(() => null))),
    countNewsletterRecipients(ctx, nl.id),
    newsletterReadStats(ctx, nl.id),
  ]);
  const base = `/app/${workspace.slug}/newsletters`;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link
        href={base}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" /> {t("back")}
      </Link>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">
          {nl.translations[workspace.defaultLocale]?.subject ||
            Object.values(nl.translations)[0]?.subject ||
            t("untitled")}
        </h1>
        <Badge tone={STATUS_TONE[nl.status]}>{t(`status.${nl.status}`)}</Badge>
        {nl.status === "draft" || nl.status === "sent" ? (
          <span className="text-[13px] text-fg-muted">
            {t(`generator.${nl.generator as "ai"}`)} ·{" "}
            {nl.sentAt
              ? t("sentOn", { date: format.dateTime(nl.sentAt, { dateStyle: "medium" }) })
              : t("createdOn", { date: format.dateTime(nl.createdAt, { dateStyle: "medium" }) })}
          </span>
        ) : null}
      </div>
      <NewsletterView
        wsSlug={workspace.slug}
        newsletter={{
          id: nl.id,
          status: nl.status,
          error: nl.error,
          version: nl.version,
          recipients: nl.recipients,
          sentCount: nl.sentCount,
          failedCount: nl.failedCount,
          translations: nl.translations,
        }}
        locales={workspace.locales.map((code) => ({
          code,
          name: localeInfo(code)?.nativeName ?? code,
        }))}
        defaultLocale={workspace.defaultLocale}
        posts={nl.posts.flatMap((np, i) => {
          const p = posts[i];
          if (!p) return [];
          const tr = p.translations[workspace.defaultLocale] ?? Object.values(p.translations)[0]!;
          return [
            {
              id: p.id,
              title: tr.title,
              featured: np.featured,
              reads: reads.posts[p.id] ?? { widget: 0, email: 0 },
              url: postUrl(workspace, { slug: tr.slug, publicId: p.publicId }, tr.locale),
            },
          ];
        })}
        subscriberCount={audience.recipients}
        skippedReaders={audience.skippedReaders}
        emailReaders={reads.emailReaders}
        emailEnabled={env.emailEnabled}
      />
    </div>
  );
}

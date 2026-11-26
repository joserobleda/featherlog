import { getNewsletterSettings } from "@featherlog/core";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/panel/page-header";
import { db } from "@/lib/db";
import { getNewsletterContext } from "../guard";
import { NewsletterSettingsForm } from "./settings-form";

export async function generateMetadata() {
  const t = await getTranslations("newsletters");
  return { title: t("settingsTitle") };
}

export default async function NewsletterSettingsPage({
  params,
}: {
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  const { workspace } = await getNewsletterContext(ws);
  const t = await getTranslations("newsletters");
  const s = await getNewsletterSettings(db, workspace.id);
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <Link
        href={`/app/${workspace.slug}/newsletters`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" /> {t("back")}
      </Link>
      <PageHeader title={t("settingsTitle")} description={t("settingsDescription")} />
      <NewsletterSettingsForm
        wsSlug={workspace.slug}
        workspaceName={workspace.name}
        initial={{
          fromName: s.fromName ?? "",
          replyTo: s.replyTo ?? "",
          footerText: s.footerText,
          aiInstructions: s.aiInstructions,
          skipReaders: s.skipReaders,
          postsSince: s.postsSince?.toISOString().slice(0, 10) ?? "",
        }}
      />
    </div>
  );
}

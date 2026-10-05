import type { Terminology } from "@featherlog/core";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/panel/page-header";
import { env } from "@/lib/env";
import { getSettingsContext } from "../_lib/guard";
import { DangerZone, GeneralForm, LogoCard } from "./general-form";

export async function generateMetadata() {
  const t = await getTranslations("settings.general");
  return { title: t("title") };
}

export default async function GeneralSettingsPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const { workspace, role } = await getSettingsContext(ws);
  const t = await getTranslations("settings.general");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid gap-6">
        <GeneralForm
          wsSlug={workspace.slug}
          publicBase={env.PUBLIC_URL.replace(/^https?:\/\//, "")}
          initial={{
            name: workspace.name,
            slug: workspace.slug,
            terminology: workspace.terminology as Terminology,
            websiteUrl: workspace.websiteUrl ?? "",
          }}
        />
        <LogoCard wsSlug={workspace.slug} name={workspace.name} logoUrl={workspace.logoUrl} />
        {role === "owner" ? <DangerZone wsSlug={workspace.slug} name={workspace.name} /> : null}
      </div>
    </>
  );
}

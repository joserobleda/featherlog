import { Bot } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/panel/page-header";
import { EmptyState } from "@/components/ui/empty";
import { getSettingsContext } from "../_lib/guard";

export async function generateMetadata() {
  const t = await getTranslations("settings.api");
  return { title: t("title") };
}

export default async function ApiSettingsPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  await getSettingsContext(ws);
  const t = await getTranslations("settings.api");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <EmptyState icon={<Bot />} title={t("comingSoon")} description={t("comingSoonDescription")} />
    </>
  );
}

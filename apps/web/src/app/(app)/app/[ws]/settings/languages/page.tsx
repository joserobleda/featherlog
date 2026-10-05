import { Languages } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/panel/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { getSettingsContext } from "../_lib/guard";
import { LanguagesForm } from "./languages-form";

export async function generateMetadata() {
  const t = await getTranslations("settings.languages");
  return { title: t("title") };
}

const code = (chunks: React.ReactNode) => (
  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px] text-fg">{chunks}</code>
);

export default async function LanguagesSettingsPage({
  params,
}: {
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  const { workspace } = await getSettingsContext(ws);
  const t = await getTranslations("settings.languages");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid gap-6">
        <LanguagesForm
          wsSlug={workspace.slug}
          initial={{
            defaultLocale: workspace.defaultLocale,
            locales: workspace.locales,
            missingTranslation: workspace.missingTranslation === "hide" ? "hide" : "fallback",
          }}
        />
        <Card>
          <CardBody className="flex items-start gap-3">
            <Languages className="mt-0.5 size-5 shrink-0 text-brand" />
            <div className="grid gap-1.5 text-[13px] text-fg-muted">
              <p className="text-sm font-medium text-fg">{t("explainerTitle")}</p>
              <p>{t.rich("explainerBody", { code })}</p>
              <p>{t.rich("explainerForce", { code })}</p>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

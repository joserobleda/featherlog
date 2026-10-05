import { listCategories, localeInfo } from "@featherlog/core";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/panel/page-header";
import { db } from "@/lib/db";
import { getSettingsContext } from "../_lib/guard";
import { CategoriesManager } from "./categories-manager";

export async function generateMetadata() {
  const t = await getTranslations("settings.categories");
  return { title: t("title") };
}

export default async function CategoriesSettingsPage({
  params,
}: {
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  const { workspace } = await getSettingsContext(ws);
  const t = await getTranslations("settings.categories");
  const categories = await listCategories(db, workspace.id);
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <CategoriesManager
        wsSlug={workspace.slug}
        initial={categories}
        defaultLocale={workspace.defaultLocale}
        locales={workspace.locales.map((code) => ({
          code,
          label: localeInfo(code)?.nativeName ?? code,
        }))}
      />
    </>
  );
}

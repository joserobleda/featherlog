import { listApiKeys, listAuthorizedApps } from "@featherlog/core";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/panel/page-header";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getSettingsContext } from "../_lib/guard";
import { ApiSettings } from "./api-settings";

export async function generateMetadata() {
  const t = await getTranslations("settings.api");
  return { title: t("title") };
}

export default async function ApiSettingsPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const { ctx, workspace, session } = await getSettingsContext(ws);
  const t = await getTranslations("settings.api");
  const [keys, apps] = await Promise.all([
    listApiKeys(ctx),
    listAuthorizedApps(db, session.user.id),
  ]);
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <ApiSettings
        workspace={workspace.slug}
        integrationsCanPublish={workspace.integrationsCanPublish}
        appUrl={env.APP_URL}
        keys={keys.map((k) => ({
          ...k,
          lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
          expiresAt: k.expiresAt?.toISOString() ?? null,
          createdAt: k.createdAt.toISOString(),
        }))}
        apps={apps.map((a) => ({
          ...a,
          name: a.name ?? a.clientId,
          authorizedAt: a.authorizedAt.toISOString(),
        }))}
      />
    </>
  );
}

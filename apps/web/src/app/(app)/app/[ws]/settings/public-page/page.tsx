import { ExternalLink, Globe } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/panel/page-header";
import { CopyField } from "@/components/settings/copy-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { publicUrl } from "@/lib/urls";
import { getSettingsContext } from "../_lib/guard";
import { PublicPageForm } from "./public-page-form";

export async function generateMetadata() {
  const t = await getTranslations("settings.publicPage");
  return { title: t("title") };
}

export default async function PublicPageSettings({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const { workspace } = await getSettingsContext(ws);
  const t = await getTranslations("settings.publicPage");
  const url = publicUrl(workspace.slug);
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid gap-6">
        <Card>
          <CardHeader
            title={t("publicUrl")}
            description={workspace.privateMode ? t("publicUrlPrivate") : t("publicUrlDescription")}
            actions={
              <Button asChild variant="secondary" size="sm">
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLink />
                  {t("open")}
                </a>
              </Button>
            }
          />
          <CardBody>
            <CopyField value={url} aria-label={t("publicUrl")} />
          </CardBody>
        </Card>
        <PublicPageForm
          wsSlug={workspace.slug}
          initial={{
            accentColor: workspace.accentColor,
            showAuthors: workspace.showAuthors,
            noindex: workspace.noindex,
            privateMode: workspace.privateMode,
            whitelabel: workspace.whitelabel,
          }}
        />
        <Card>
          <CardBody className="flex items-start gap-3">
            <Globe className="mt-0.5 size-5 shrink-0 text-fg-muted" />
            <div className="grid gap-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{t("customDomain")}</p>
                <Badge>{t("comingSoon")}</Badge>
              </div>
              <p className="text-[13px] text-fg-muted">{t("customDomainDescription")}</p>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

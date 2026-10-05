import { getWidgetSettings, localeInfo, WIDGET_STRING_KEYS } from "@featherlog/core";
import { Info } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/panel/page-header";
import { CodeBlock } from "@/components/settings/copy-field";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { widgetStrings } from "@/lib/public-i18n";
import { getSettingsContext } from "../_lib/guard";
import { WidgetSettingsForm } from "./widget-settings-form";

export async function generateMetadata() {
  const t = await getTranslations("settings.widget");
  return { title: t("title") };
}

export default async function WidgetSettingsPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const { workspace } = await getSettingsContext(ws);
  const t = await getTranslations("settings.widget");
  const settings = await getWidgetSettings(db, workspace.id);
  const widgetUrl = env.WIDGET_URL;

  const snippet = `<!-- ${t("snippetBadgeComment")} -->
<span class="featherlog-badge"></span>

<script>
  var HW_config = {
    selector: ".featherlog-badge",
    account: "${workspace.publicId}"
  };
</script>
<script async src="${widgetUrl}/widget.js"></script>`;

  const spaSnippet = `<!-- index.html -->
<script async src="${widgetUrl}/widget.js"></script>

// ${t("snippetSpaComment")}
useEffect(() => {
  const config = {
    selector: ".featherlog-badge",
    account: "${workspace.publicId}",
    // language: "es", // ${t("snippetLanguageComment")}
  };
  // If the script hasn't loaded yet, it picks up HW_config and initializes itself.
  if (window.Featherlog) window.Featherlog.init(config);
  else window.HW_config = config;
  return () => window.Featherlog?.destroy();
}, []);`;

  const locales = workspace.locales.map((code) => ({
    code,
    label: localeInfo(code)?.nativeName ?? code,
  }));
  const defaults = Object.fromEntries(
    workspace.locales.map((code) => {
      const s = widgetStrings(code);
      return [code, Object.fromEntries(WIDGET_STRING_KEYS.map((k) => [k, s[k]]))];
    }),
  );

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid gap-6">
        <Card>
          <CardHeader title={t("install")} description={t("installDescription")} />
          <CardBody className="grid gap-4">
            <CodeBlock code={snippet} label="HTML" />
            <div className="flex gap-2.5 rounded-lg bg-brand/5 px-3 py-2.5 text-[13px] text-fg">
              <Info className="mt-0.5 size-4 shrink-0 text-brand" />
              <p>{t("headwayNote", { url: `${widgetUrl}/widget.js` })}</p>
            </div>
            <details className="group">
              <summary className="cursor-pointer select-none text-sm font-medium text-fg hover:text-brand">
                {t("spaTitle")}
              </summary>
              <div className="mt-3 grid gap-2">
                <p className="text-[13px] text-fg-muted">{t("spaDescription")}</p>
                <CodeBlock code={spaSnippet} label="SPA / React" />
              </div>
            </details>
          </CardBody>
        </Card>
        <WidgetSettingsForm
          wsSlug={workspace.slug}
          workspaceAccent={workspace.accentColor}
          locales={locales}
          defaultLocale={workspace.defaultLocale}
          defaults={defaults}
          preview={{ publicId: workspace.publicId, widgetUrl, siteName: workspace.name }}
          initial={{
            accentColor: settings.accentColor,
            badgeDelay: settings.badgeDelay,
            entriesLimit: settings.entriesLimit,
            expireAfterDays: settings.expireAfterDays,
            softHide: settings.softHide,
            eyecatcher: settings.eyecatcher as "off" | "on" | "progressive",
            uiStrings: settings.uiStrings ?? {},
          }}
        />
      </div>
    </>
  );
}

"use client";
import { RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";

type FeatherlogApi = { init(config: Record<string, unknown>): void; destroy(): void };
const getApi = () => (window as unknown as { Featherlog?: FeatherlogApi }).Featherlog;

let loading: Promise<void> | null = null;

/** Loads `<widgetUrl>/widget.js` once per page. */
function loadWidget(widgetUrl: string) {
  if (getApi()) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `${widgetUrl}/widget.js`;
    s.async = true;
    s.dataset.featherlogPreview = "";
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      s.remove();
      reject(new Error("widget.js failed to load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Live preview: a fake host page with the real widget attached to a "What's new" button.
 * Re-initializes whenever `version` changes (after saving) or the language changes.
 */
export function WidgetPreview({
  publicId,
  widgetUrl,
  locales,
  defaultLocale,
  siteName,
  version,
}: {
  publicId: string;
  widgetUrl: string;
  locales: { code: string; label: string }[];
  defaultLocale: string;
  siteName: string;
  version: number;
}) {
  const t = useTranslations("settings.widget");
  const langId = useId();
  const [language, setLanguage] = useState(defaultLocale);
  const [reload, setReload] = useState(0);
  const [failed, setFailed] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `version`/`reload` intentionally re-init the widget
  useEffect(() => {
    let cancelled = false;
    loadWidget(widgetUrl)
      .then(() => {
        if (cancelled) return;
        setFailed(false);
        getApi()?.init({ selector: "#fl-preview-badge", account: publicId, widgetUrl, language });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      getApi()?.destroy();
    };
  }, [publicId, widgetUrl, language, version, reload]);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {locales.length > 1 ? (
          <div className="flex items-center gap-2">
            <label htmlFor={langId} className="text-[13px] text-fg-muted">
              {t("previewLanguage")}
            </label>
            <Select
              id={langId}
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="h-8 w-auto text-[13px]"
            >
              {locales.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <span />
        )}
        <Button type="button" variant="ghost" size="sm" onClick={() => setReload((n) => n + 1)}>
          <RotateCw />
          {t("previewReload")}
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-white text-neutral-900 shadow-sm">
        <div className="flex items-center gap-1.5 border-b border-neutral-200 bg-neutral-100 px-3 py-2">
          <span className="size-2.5 rounded-full bg-red-400" />
          <span className="size-2.5 rounded-full bg-amber-400" />
          <span className="size-2.5 rounded-full bg-green-400" />
          <span className="ml-3 truncate rounded-md bg-white px-2 py-0.5 text-[11px] text-neutral-500">
            {t("previewHost")}
          </span>
        </div>
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <span className="size-6 rounded-md bg-neutral-800" aria-hidden />
            <span className="text-sm">{siteName}</span>
          </div>
          <div className="flex items-center gap-4 text-[13px] text-neutral-600">
            <span className="hidden sm:inline">{t("previewNavDocs")}</span>
            <span className="hidden sm:inline">{t("previewNavPricing")}</span>
            <span className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-2.5 py-1 font-medium text-neutral-800">
              {t("previewWhatsNew")}
              <span id="fl-preview-badge" />
            </span>
          </div>
        </div>
        <div className="grid min-h-[380px] content-start gap-3 px-5 py-6" aria-hidden>
          <div className="h-5 w-1/2 rounded bg-neutral-200" />
          <div className="h-3 w-5/6 rounded bg-neutral-100" />
          <div className="h-3 w-4/6 rounded bg-neutral-100" />
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="h-20 rounded-lg bg-neutral-100" />
            <div className="h-20 rounded-lg bg-neutral-100" />
            <div className="h-20 rounded-lg bg-neutral-100" />
          </div>
        </div>
      </div>
      <p className="text-[13px] text-fg-muted" role={failed ? "alert" : undefined}>
        {failed ? t("previewFailed") : t("previewHint")}
      </p>
    </div>
  );
}

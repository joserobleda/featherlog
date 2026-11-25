"use client";
import {
  type CsvImportPreview,
  MAX_SUBSCRIBER_BATCH,
  subscribersFromCsv,
} from "@featherlog/core/client";
import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { SwitchRow } from "@/components/ui/switch";
import { importSubscribersAction } from "./actions";

export function ImportDialog({ wsSlug }: { wsSlug: string }) {
  const t = useTranslations("settings.subscribers.import");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [allOptOut, setAllOptOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  let preview: CsvImportPreview | null = null;
  let parseError = error;
  if (text !== null && !parseError) {
    try {
      preview = subscribersFromCsv(text, { markAllUnsubscribed: allOptOut });
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e);
    }
  }
  const optOuts = preview?.items.filter((i) => i.unsubscribed).length ?? 0;

  const reset = () => {
    setText(null);
    setFileName("");
    setAllOptOut(false);
    setError(null);
    setProgress(null);
  };

  const run = async () => {
    if (!preview) return;
    const totals = { created: 0, updated: 0, unchanged: 0 };
    for (let i = 0; i < preview.items.length; i += MAX_SUBSCRIBER_BATCH) {
      setProgress(i);
      const res = await importSubscribersAction(
        wsSlug,
        preview.items.slice(i, i + MAX_SUBSCRIBER_BATCH),
      ).catch((e: unknown) => ({
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
      }));
      if (!res.ok) {
        toast.error(res.error);
        setProgress(null);
        return;
      }
      totals.created += res.data.created;
      totals.updated += res.data.updated;
      totals.unchanged += res.data.unchanged;
    }
    toast.success(t("done", totals));
    setOpen(false);
    reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (progress !== null) return;
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="secondary">
          <Upload /> {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("title")} description={t("description")}>
        <div className="grid gap-3">
          <Field label={t("file")} htmlFor="import-file" error={parseError ?? undefined}>
            <Input
              id="import-file"
              type="file"
              accept=".csv,text/csv,text/plain"
              disabled={progress !== null}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                setError(null);
                if (!file) return setText(null);
                if (file.size > 20 * 1024 * 1024) {
                  setText(null);
                  return setError(t("tooBig"));
                }
                setFileName(file.name);
                setText(await file.text());
              }}
            />
          </Field>
          <SwitchRow
            id="import-all-opt-out"
            label={t("allOptOut")}
            description={t("allOptOutDescription")}
            checked={allOptOut}
            disabled={progress !== null}
            onCheckedChange={setAllOptOut}
          />
          {preview ? (
            <div className="grid gap-1.5 rounded-lg bg-muted/60 p-3 text-sm" aria-live="polite">
              <p>
                {t("summary", {
                  file: fileName,
                  count: preview.items.length,
                  optOuts,
                })}
              </p>
              <p className="text-[13px] text-fg-muted">
                {t("columns", {
                  columns: Object.entries(preview.columns)
                    .filter(([, v]) => v)
                    .map(([k, v]) => `${t(`column.${k as "email"}`)}: ${v}`)
                    .join(" · "),
                })}
              </p>
              {preview.skipped.length > 0 ? (
                <details className="text-[13px] text-fg-muted">
                  <summary>{t("skipped", { count: preview.skipped.length })}</summary>
                  <ul className="mt-1 grid gap-0.5">
                    {preview.skipped.slice(0, 20).map((s) => (
                      <li key={s.line}>
                        {t("line", { line: s.line })}: {s.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              <p className="text-[13px] text-fg-muted">{t("stickyNote")}</p>
            </div>
          ) : null}
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={run}
              disabled={!preview || preview.items.length === 0}
              loading={progress !== null}
            >
              {progress !== null
                ? t("progress", { done: progress, total: preview?.items.length ?? 0 })
                : t("submit", { count: preview?.items.length ?? 0 })}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

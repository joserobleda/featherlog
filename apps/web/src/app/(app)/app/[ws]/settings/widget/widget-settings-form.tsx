"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useActionRunner } from "@/components/settings/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { ColorInput } from "@/components/ui/color-input";
import { Field, Input, Select } from "@/components/ui/input";
import { Switch, SwitchRow } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { updateWidgetAction, type WidgetFormInput } from "./actions";
import { WidgetPreview } from "./widget-preview";

const STRING_KEYS = ["title", "readMore", "footer", "back", "empty", "newBadge"] as const;
const DELAYS = [0, 1, 3, 6, 10, 30];
const EXPIRY = [null, 3, 6, 10, 15, 30];
const EYECATCHERS = ["off", "on", "progressive"] as const;
const META_POSITIONS = ["above", "below"] as const;

type LocaleOption = { code: string; label: string };

export function WidgetSettingsForm({
  wsSlug,
  initial,
  workspaceAccent,
  locales,
  defaultLocale,
  defaults,
  preview,
}: {
  wsSlug: string;
  initial: WidgetFormInput;
  workspaceAccent: string;
  locales: LocaleOption[];
  defaultLocale: string;
  /** Built-in widget strings per locale (placeholders). */
  defaults: Record<string, Record<string, string>>;
  preview: { publicId: string; widgetUrl: string; siteName: string };
}) {
  const t = useTranslations("settings");
  const [values, setValues] = useState<WidgetFormInput>(initial);
  const [customAccent, setCustomAccent] = useState(initial.accentColor !== null);
  const [accent, setAccent] = useState(initial.accentColor ?? workspaceAccent);
  const [stringsLocale, setStringsLocale] = useState(defaultLocale);
  const [version, setVersion] = useState(0);
  const { pending, errors, run } = useActionRunner();
  const set = <K extends keyof WidgetFormInput>(key: K, value: WidgetFormInput[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const accentValid = !customAccent || /^#[0-9a-fA-F]{6}$/.test(accent);
  const limitValid =
    Number.isInteger(values.entriesLimit) && values.entriesLimit >= 1 && values.entriesLimit <= 20;

  const setString = (locale: string, key: string, value: string) =>
    setValues((v) => ({
      ...v,
      uiStrings: { ...v.uiStrings, [locale]: { ...(v.uiStrings[locale] ?? {}), [key]: value } },
    }));

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader title={t("widget.preview")} description={t("widget.previewDescription")} />
        <CardBody>
          <WidgetPreview
            publicId={preview.publicId}
            widgetUrl={preview.widgetUrl}
            siteName={preview.siteName}
            locales={locales}
            defaultLocale={defaultLocale}
            version={version}
          />
        </CardBody>
      </Card>

      <Card>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!accentValid || !limitValid) return;
            run(
              () =>
                updateWidgetAction(wsSlug, {
                  ...values,
                  accentColor: customAccent ? accent : null,
                }),
              { success: t("saved"), onSuccess: () => setVersion((n) => n + 1) },
            );
          }}
        >
          <CardHeader title={t("widget.behavior")} description={t("widget.behaviorDescription")} />
          <CardBody className="grid gap-5">
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-4">
                <div className="grid gap-0.5">
                  <label htmlFor="custom-accent" className="text-sm font-medium">
                    {t("widget.customAccent")}
                  </label>
                  <p className="text-[13px] text-fg-muted">
                    {t("widget.customAccentDescription", { color: workspaceAccent })}
                  </p>
                </div>
                <Switch
                  id="custom-accent"
                  checked={customAccent}
                  onCheckedChange={setCustomAccent}
                />
              </div>
              {customAccent ? (
                <Field
                  htmlFor="widget-accent"
                  error={errors.accentColor ?? (accentValid ? undefined : t("invalidColor"))}
                  className="max-w-xs"
                >
                  <ColorInput id="widget-accent" value={accent} onChange={setAccent} />
                </Field>
              ) : null}
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
              <Field
                label={t("widget.badgeDelay")}
                htmlFor="badge-delay"
                hint={t("widget.badgeDelayHint")}
              >
                <Select
                  id="badge-delay"
                  value={values.badgeDelay}
                  onChange={(e) => set("badgeDelay", Number(e.target.value))}
                >
                  {DELAYS.map((d) => (
                    <option key={d} value={d}>
                      {d === 0 ? t("widget.immediately") : t("widget.seconds", { count: d })}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={t("widget.entriesLimit")}
                htmlFor="entries-limit"
                hint={t("widget.entriesLimitHint")}
                error={
                  errors.entriesLimit ?? (limitValid ? undefined : t("widget.entriesLimitError"))
                }
              >
                <Input
                  id="entries-limit"
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  value={Number.isNaN(values.entriesLimit) ? "" : values.entriesLimit}
                  aria-invalid={!limitValid}
                  onChange={(e) => set("entriesLimit", Number.parseInt(e.target.value, 10))}
                />
              </Field>
              <Field
                label={t("widget.expireAfter")}
                htmlFor="expire-after"
                hint={t("widget.expireAfterHint")}
              >
                <Select
                  id="expire-after"
                  value={values.expireAfterDays ?? ""}
                  onChange={(e) =>
                    set("expireAfterDays", e.target.value ? Number(e.target.value) : null)
                  }
                >
                  {EXPIRY.map((d) => (
                    <option key={d ?? "never"} value={d ?? ""}>
                      {d === null ? t("widget.never") : t("widget.days", { count: d })}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <fieldset className="grid gap-2">
              <legend className="mb-1.5 text-sm font-medium">{t("widget.eyecatcher")}</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {EYECATCHERS.map((mode) => (
                  <label
                    key={mode}
                    className={cn(
                      "flex cursor-pointer flex-col gap-0.5 rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-muted/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40",
                      values.eyecatcher === mode && "border-brand bg-brand/5",
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="radio"
                        name="eyecatcher"
                        value={mode}
                        checked={values.eyecatcher === mode}
                        onChange={() => set("eyecatcher", mode)}
                        className="accent-[var(--color-brand)]"
                      />
                      {t(`widget.eyecatcherModes.${mode}`)}
                    </span>
                    <span className="text-[12.5px] text-fg-muted">
                      {t(`widget.eyecatcherModes.${mode}Description`)}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="border-t border-border">
              <SwitchRow
                id="soft-hide"
                label={t("widget.softHide")}
                description={t("widget.softHideDescription")}
                checked={values.softHide}
                onCheckedChange={(v) => set("softHide", v)}
              />
            </div>

            <fieldset className="grid gap-2 border-t border-border pt-5">
              <legend className="sr-only">{t("widget.layout")}</legend>
              <p className="mb-1.5 text-sm font-medium" aria-hidden="true">
                {t("widget.metaPosition")}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {META_POSITIONS.map((pos) => (
                  <label
                    key={pos}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40",
                      values.metaPosition === pos && "border-brand bg-brand/5",
                    )}
                  >
                    <input
                      type="radio"
                      name="meta-position"
                      value={pos}
                      checked={values.metaPosition === pos}
                      onChange={() => set("metaPosition", pos)}
                      className="accent-[var(--color-brand)]"
                    />
                    {t(`widget.metaPositions.${pos}`)}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="border-t border-border">
              <SwitchRow
                id="sticky-footer"
                label={t("widget.stickyFooter")}
                description={t("widget.stickyFooterDescription")}
                checked={values.stickyFooter}
                onCheckedChange={(v) => set("stickyFooter", v)}
              />
            </div>
          </CardBody>

          <div className="border-t border-border">
            <CardHeader
              className="border-b-0 pb-0"
              title={t("widget.texts")}
              description={t("widget.textsDescription")}
            />
            <CardBody className="grid gap-4">
              {locales.length > 1 ? (
                <div
                  role="tablist"
                  aria-label={t("widget.textsLanguage")}
                  className="flex flex-wrap gap-1 rounded-lg bg-muted p-1"
                >
                  {locales.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      role="tab"
                      aria-selected={stringsLocale === l.code}
                      onClick={() => setStringsLocale(l.code)}
                      className={cn(
                        "rounded-md px-3 py-1 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
                        stringsLocale === l.code && "bg-surface text-fg shadow-xs",
                      )}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <div role="tabpanel" className="grid gap-4 sm:grid-cols-2">
                {STRING_KEYS.map((key) => {
                  const id = `str-${stringsLocale}-${key}`;
                  return (
                    <Field key={id} label={t(`widget.strings.${key}`)} htmlFor={id}>
                      <Input
                        id={id}
                        maxLength={120}
                        value={values.uiStrings[stringsLocale]?.[key] ?? ""}
                        placeholder={defaults[stringsLocale]?.[key] ?? ""}
                        onChange={(e) => setString(stringsLocale, key, e.target.value)}
                      />
                    </Field>
                  );
                })}
              </div>
              {errors.uiStrings ? (
                <p className="text-[13px] text-danger" role="alert">
                  {errors.uiStrings}
                </p>
              ) : null}
            </CardBody>
          </div>
          <CardFooter>
            <Button type="submit" loading={pending} disabled={!accentValid || !limitValid}>
              {t("save")}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

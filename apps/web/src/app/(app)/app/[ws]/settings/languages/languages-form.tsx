"use client";
import { LOCALES } from "@featherlog/core/client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useActionRunner } from "@/components/settings/use-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { updateLanguagesAction } from "./actions";

type Policy = "fallback" | "hide";
type Values = { defaultLocale: string; locales: string[]; missingTranslation: Policy };

export function LanguagesForm({ wsSlug, initial }: { wsSlug: string; initial: Values }) {
  const t = useTranslations("settings");
  const [values, setValues] = useState<Values>(initial);
  const [saved, setSaved] = useState<Values>(initial);
  const { pending, errors, run } = useActionRunner();
  const dirty =
    values.defaultLocale !== saved.defaultLocale ||
    values.missingTranslation !== saved.missingTranslation ||
    [...values.locales].sort().join() !== [...saved.locales].sort().join();

  const toggle = (code: string, on: boolean) =>
    setValues((v) => ({
      ...v,
      locales: on ? [...v.locales, code] : v.locales.filter((c) => c !== code),
    }));

  return (
    <Card>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => updateLanguagesAction(wsSlug, values), {
            success: t("saved"),
            onSuccess: (data) => {
              const next = { ...values, ...data };
              setValues(next);
              setSaved(next);
            },
          });
        }}
      >
        <CardHeader
          title={t("languages.languagesTitle")}
          description={t("languages.languagesDescription")}
        />
        <CardBody className="grid gap-6">
          <Field
            label={t("languages.defaultLocale")}
            htmlFor="default-locale"
            hint={t("languages.defaultLocaleHint")}
            error={errors.defaultLocale}
            className="max-w-sm"
          >
            <Select
              id="default-locale"
              value={values.defaultLocale}
              onChange={(e) => {
                const code = e.target.value;
                setValues((v) => ({
                  ...v,
                  defaultLocale: code,
                  locales: v.locales.includes(code) ? v.locales : [code, ...v.locales],
                }));
              }}
            >
              {LOCALES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.nativeName} ({l.name})
                </option>
              ))}
            </Select>
          </Field>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{t("languages.enabled")}</legend>
            <p className="mb-1 text-[13px] text-fg-muted">{t("languages.enabledHint")}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {LOCALES.map((l) => {
                const isDefault = l.code === values.defaultLocale;
                const checked = isDefault || values.locales.includes(l.code);
                return (
                  <label
                    key={l.code}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-muted/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40",
                      checked && "border-brand/50 bg-brand/5",
                      isDefault && "cursor-default",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isDefault}
                      onChange={(e) => toggle(l.code, e.target.checked)}
                      className="size-4 accent-[var(--color-brand)]"
                    />
                    <span className="flex-1 truncate" lang={l.code} dir={l.dir}>
                      {l.nativeName}
                    </span>
                    {isDefault ? <Badge tone="brand">{t("languages.default")}</Badge> : null}
                  </label>
                );
              })}
            </div>
            {errors.locales ? (
              <p className="text-[13px] text-danger" role="alert">
                {errors.locales}
              </p>
            ) : null}
          </fieldset>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{t("languages.missing")}</legend>
            {(["fallback", "hide"] as const).map((p) => (
              <label
                key={p}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-muted/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40",
                  values.missingTranslation === p && "border-brand/50 bg-brand/5",
                )}
              >
                <input
                  type="radio"
                  name="missing"
                  value={p}
                  checked={values.missingTranslation === p}
                  onChange={() => setValues((v) => ({ ...v, missingTranslation: p }))}
                  className="mt-1 accent-[var(--color-brand)]"
                />
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">{t(`languages.policy.${p}`)}</span>
                  <span className="text-[13px] text-fg-muted">
                    {t(`languages.policy.${p}Description`)}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        </CardBody>
        <CardFooter>
          <Button type="submit" loading={pending} disabled={!dirty}>
            {t("save")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

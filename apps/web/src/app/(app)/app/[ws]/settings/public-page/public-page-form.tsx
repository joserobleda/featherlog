"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useActionRunner } from "@/components/settings/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { ColorInput } from "@/components/ui/color-input";
import { Field } from "@/components/ui/input";
import { SwitchRow } from "@/components/ui/switch";
import { updatePublicPageAction } from "./actions";

type Values = {
  accentColor: string;
  showAuthors: boolean;
  noindex: boolean;
  privateMode: boolean;
  whitelabel: boolean;
};

export function PublicPageForm({ wsSlug, initial }: { wsSlug: string; initial: Values }) {
  const t = useTranslations("settings");
  const [values, setValues] = useState<Values>(initial);
  const [saved, setSaved] = useState<Values>(initial);
  const { pending, errors, run } = useActionRunner();
  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const dirty = (Object.keys(values) as (keyof Values)[]).some((k) => values[k] !== saved[k]);
  const colorValid = /^#[0-9a-fA-F]{6}$/.test(values.accentColor);

  return (
    <Card>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => updatePublicPageAction(wsSlug, values), {
            success: t("saved"),
            onSuccess: () => setSaved(values),
          });
        }}
      >
        <CardHeader
          title={t("publicPage.appearance")}
          description={t("publicPage.appearanceDescription")}
        />
        <CardBody className="grid gap-2">
          <Field
            label={t("publicPage.accentColor")}
            htmlFor="accent-color"
            hint={t("publicPage.accentColorHint")}
            error={errors.accentColor ?? (colorValid ? undefined : t("invalidColor"))}
            className="max-w-xs pb-3"
          >
            <ColorInput
              id="accent-color"
              value={values.accentColor}
              onChange={(v) => set("accentColor", v)}
            />
          </Field>
          <div className="divide-y divide-border border-t border-border">
            <SwitchRow
              id="show-authors"
              label={t("publicPage.showAuthors")}
              description={t("publicPage.showAuthorsDescription")}
              checked={values.showAuthors}
              onCheckedChange={(v) => set("showAuthors", v)}
            />
            <SwitchRow
              id="noindex"
              label={t("publicPage.noindex")}
              description={t("publicPage.noindexDescription")}
              checked={values.noindex}
              onCheckedChange={(v) => set("noindex", v)}
            />
            <SwitchRow
              id="private-mode"
              label={t("publicPage.privateMode")}
              description={t("publicPage.privateModeDescription")}
              checked={values.privateMode}
              onCheckedChange={(v) => set("privateMode", v)}
            />
            <SwitchRow
              id="whitelabel"
              label={t("publicPage.whitelabel")}
              description={t("publicPage.whitelabelDescription")}
              checked={values.whitelabel}
              onCheckedChange={(v) => set("whitelabel", v)}
            />
          </div>
        </CardBody>
        <CardFooter>
          <Button type="submit" loading={pending} disabled={!dirty || !colorValid}>
            {t("save")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useActionRunner } from "@/components/settings/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SwitchRow } from "@/components/ui/switch";
import { updateNewsletterSettingsAction } from "../actions";

type Values = {
  fromName: string;
  replyTo: string;
  footerText: string;
  aiInstructions: string;
  skipReaders: boolean;
};

export function NewsletterSettingsForm({
  wsSlug,
  workspaceName,
  initial,
}: {
  wsSlug: string;
  workspaceName: string;
  initial: Values;
}) {
  const t = useTranslations("newsletters");
  const [v, setV] = useState(initial);
  const { pending, errors, run } = useActionRunner();
  const set = (patch: Partial<Values>) => setV((s) => ({ ...s, ...patch }));
  return (
    <Card>
      <CardBody>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => updateNewsletterSettingsAction(wsSlug, v), { success: t("settingsSaved") });
          }}
        >
          <Field
            label={t("fromName")}
            htmlFor="nl-from"
            hint={t("fromNameHint")}
            error={errors.fromName}
          >
            <Input
              id="nl-from"
              value={v.fromName}
              placeholder={workspaceName}
              maxLength={100}
              onChange={(e) => set({ fromName: e.target.value })}
            />
          </Field>
          <Field label={t("replyTo")} htmlFor="nl-reply" error={errors.replyTo}>
            <Input
              id="nl-reply"
              type="email"
              value={v.replyTo}
              placeholder="hello@company.com"
              onChange={(e) => set({ replyTo: e.target.value })}
            />
          </Field>
          <Field
            label={t("footerText")}
            htmlFor="nl-footer"
            hint={t("footerHint")}
            error={errors.footerText}
          >
            <Textarea
              id="nl-footer"
              rows={3}
              value={v.footerText}
              maxLength={1000}
              onChange={(e) => set({ footerText: e.target.value })}
            />
          </Field>
          <Field
            label={t("aiInstructions")}
            htmlFor="nl-ai"
            hint={t("aiInstructionsHint")}
            error={errors.aiInstructions}
          >
            <Textarea
              id="nl-ai"
              rows={5}
              value={v.aiInstructions}
              maxLength={4000}
              onChange={(e) => set({ aiInstructions: e.target.value })}
            />
          </Field>
          <SwitchRow
            id="nl-skip-readers"
            label={t("skipReaders")}
            description={t("skipReadersHint")}
            checked={v.skipReaders}
            onCheckedChange={(checked) => set({ skipReaders: checked })}
          />
          <div>
            <Button type="submit" loading={pending}>
              {t("save")}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

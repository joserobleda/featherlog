"use client";
import { TERMINOLOGY, type Terminology } from "@featherlog/core/client";
import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/settings/confirm-dialog";
import { ImageUpload } from "@/components/settings/image-upload";
import { useActionRunner } from "@/components/settings/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { deleteWorkspaceAction, updateGeneralAction } from "./actions";

export function GeneralForm({
  wsSlug,
  initial,
  publicBase,
}: {
  wsSlug: string;
  initial: { name: string; slug: string; terminology: Terminology; websiteUrl: string };
  publicBase: string;
}) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [slug, setSlug] = useState(initial.slug);
  const [terminology, setTerminology] = useState<Terminology>(initial.terminology);
  const [websiteUrl, setWebsiteUrl] = useState(initial.websiteUrl);
  const { pending, errors, run } = useActionRunner();
  const slugChanged = slug !== initial.slug;
  const dirty =
    name !== initial.name ||
    slugChanged ||
    terminology !== initial.terminology ||
    websiteUrl !== initial.websiteUrl;

  return (
    <Card>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          run(() => updateGeneralAction(wsSlug, { name, slug, terminology, websiteUrl }), {
            success: t("saved"),
            onSuccess: (data) => {
              if (data.slug !== wsSlug) {
                router.replace(`/app/${data.slug}/settings/general`);
                router.refresh();
              }
            },
          });
        }}
      >
        <CardHeader
          title={t("general.workspace")}
          description={t("general.workspaceDescription")}
        />
        <CardBody className="grid gap-5">
          <Field label={t("general.name")} htmlFor="ws-name" error={errors.name}>
            <Input
              id="ws-name"
              required
              maxLength={80}
              value={name}
              aria-invalid={Boolean(errors.name)}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field
            label={t("general.slug")}
            htmlFor="ws-slug"
            error={errors.slug}
            hint={t("general.slugHint")}
          >
            <div className="flex items-center overflow-hidden rounded-lg border border-border bg-surface shadow-xs focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/40 has-[[aria-invalid=true]]:border-danger">
              <span className="whitespace-nowrap border-r border-border bg-muted px-3 py-2 text-sm text-fg-muted">
                {publicBase}/
              </span>
              <input
                id="ws-slug"
                className="h-9 w-full min-w-0 bg-transparent px-3 text-sm outline-none"
                value={slug}
                maxLength={48}
                aria-invalid={Boolean(errors.slug)}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              />
            </div>
          </Field>
          {slugChanged ? (
            <div
              role="status"
              className="flex gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[13px] text-amber-800 dark:text-amber-300"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>{t("general.slugWarning", { old: `${publicBase}/${initial.slug}` })}</p>
            </div>
          ) : null}
          <Field
            label={t("general.terminologyLabel")}
            htmlFor="ws-terminology"
            hint={t("general.terminologyHint")}
            error={errors.terminology}
          >
            <Select
              id="ws-terminology"
              value={terminology}
              onChange={(e) => setTerminology(e.target.value as Terminology)}
            >
              {TERMINOLOGY.map((term) => (
                <option key={term} value={term}>
                  {t(`general.terminology.${term}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t("general.website")}
            htmlFor="ws-website"
            hint={t("general.websiteHint")}
            error={errors.websiteUrl}
          >
            <Input
              id="ws-website"
              type="url"
              inputMode="url"
              placeholder="https://acme.com"
              value={websiteUrl}
              aria-invalid={Boolean(errors.websiteUrl)}
              onChange={(e) => setWebsiteUrl(e.target.value)}
            />
          </Field>
        </CardBody>
        <CardFooter>
          <Button type="submit" loading={pending} disabled={!dirty || !name.trim() || !slug}>
            {t("save")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export function LogoCard({
  wsSlug,
  name,
  logoUrl,
}: {
  wsSlug: string;
  name: string;
  logoUrl: string | null;
}) {
  const t = useTranslations("settings.general");
  return (
    <Card>
      <CardHeader title={t("logo")} description={t("logoDescription")} />
      <CardBody>
        <ImageUpload
          endpoint={`/app/${wsSlug}/settings/general/logo`}
          value={logoUrl}
          name={name}
          label={t("logo")}
        />
      </CardBody>
    </Card>
  );
}

export function DangerZone({ wsSlug, name }: { wsSlug: string; name: string }) {
  const t = useTranslations("settings.general");
  return (
    <Card className="border-red-500/30">
      <CardHeader title={t("dangerZone")} />
      <CardBody className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid max-w-md gap-0.5">
          <p className="text-sm font-medium">{t("deleteWorkspace")}</p>
          <p className="text-[13px] text-fg-muted">{t("deleteWorkspaceDescription")}</p>
        </div>
        <ConfirmDialog
          trigger={
            <Button type="button" variant="danger">
              {t("deleteWorkspace")}
            </Button>
          }
          title={t("deleteConfirmTitle", { name })}
          description={t("deleteConfirmDescription")}
          confirmText={name}
          confirmTextLabel={t("deleteConfirmType", { name })}
          confirmLabel={t("deleteWorkspaceForever")}
          onConfirm={async () => {
            const res = await deleteWorkspaceAction(wsSlug, name);
            if (res && !res.ok) {
              toast.error(res.error);
              return false;
            }
          }}
        />
      </CardBody>
    </Card>
  );
}

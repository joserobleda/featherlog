"use client";
import { LOCALES, slugify } from "@featherlog/core/client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { createWorkspaceAction } from "./actions";

export function OnboardingForm({
  publicBase,
  defaultLocale,
}: {
  publicBase: string;
  defaultLocale: string;
}) {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [locale, setLocale] = useState(defaultLocale);
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const effectiveSlug = slugTouched ? slug : slugify(name, 40);

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createWorkspaceAction({
            name,
            slug: effectiveSlug,
            defaultLocale: locale,
            websiteUrl: website,
          });
          if (!res.ok) {
            setError(res.error);
            setErrors(res.fieldErrors ?? {});
            return;
          }
          router.push(`/app/${res.data.slug}/posts`);
        });
      }}
    >
      <Field label={t("name")} htmlFor="name" error={errors.name}>
        <Input
          id="name"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme"
        />
      </Field>
      <Field label={t("slug")} htmlFor="slug" error={errors.slug}>
        <div className="flex items-center overflow-hidden rounded-lg border border-border bg-surface focus-within:ring-2 focus-within:ring-brand/40">
          <span className="whitespace-nowrap border-r border-border bg-muted px-3 py-2 text-sm text-fg-muted">
            {publicBase}/
          </span>
          <input
            id="slug"
            className="w-full bg-transparent px-3 py-2 text-sm outline-none"
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
            }}
          />
        </div>
      </Field>
      <Field label={t("language")} htmlFor="locale" hint={t("languageHint")}>
        <Select id="locale" value={locale} onChange={(e) => setLocale(e.target.value)}>
          {LOCALES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.nativeName} ({l.name})
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("website")} htmlFor="website" error={errors.websiteUrl}>
        <Input
          id="website"
          type="url"
          placeholder="https://acme.com"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </Field>
      {error && !Object.keys(errors).length ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" size="lg" loading={pending} disabled={!name || !effectiveSlug}>
        {t("submit")}
      </Button>
    </form>
  );
}

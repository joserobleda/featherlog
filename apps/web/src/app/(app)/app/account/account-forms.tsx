"use client";
import { KeyRound, MonitorSmartphone } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/settings/confirm-dialog";
import { ImageUpload } from "@/components/settings/image-upload";
import { useActionRunner } from "@/components/settings/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { setUiLocaleAction, updateProfileAction } from "./actions";

type Profile = { name: string; displayName: string; jobTitle: string };

export function ProfileForm({
  initial,
  email,
  image,
}: {
  initial: Profile;
  email: string;
  image: string | null;
}) {
  const t = useTranslations("settings");
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const { pending, errors, run } = useActionRunner();
  const dirty = (Object.keys(values) as (keyof Profile)[]).some((k) => values[k] !== saved[k]);
  const set = (k: keyof Profile, v: string) => setValues((s) => ({ ...s, [k]: v }));

  return (
    <Card>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          run(() => updateProfileAction(values), {
            success: t("saved"),
            onSuccess: (data) => {
              setValues(data);
              setSaved(data);
            },
          });
        }}
      >
        <CardHeader title={t("account.profile")} description={t("account.profileDescription")} />
        <CardBody className="grid gap-5">
          <ImageUpload
            endpoint="/app/account/avatar"
            value={image}
            name={values.displayName || values.name}
            shape="circle"
            label={t("account.avatar")}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("account.name")} htmlFor="profile-name" error={errors.name}>
              <Input
                id="profile-name"
                autoComplete="name"
                required
                maxLength={80}
                value={values.name}
                aria-invalid={Boolean(errors.name)}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field label={t("account.email")} htmlFor="profile-email" hint={t("account.emailHint")}>
              <Input id="profile-email" value={email} readOnly disabled />
            </Field>
            <Field
              label={t("account.displayName")}
              htmlFor="profile-display-name"
              hint={t("account.displayNameHint")}
              error={errors.displayName}
            >
              <Input
                id="profile-display-name"
                maxLength={80}
                placeholder={values.name}
                value={values.displayName}
                aria-invalid={Boolean(errors.displayName)}
                onChange={(e) => set("displayName", e.target.value)}
              />
            </Field>
            <Field
              label={t("account.jobTitle")}
              htmlFor="profile-job-title"
              hint={t("account.jobTitleHint")}
              error={errors.jobTitle}
            >
              <Input
                id="profile-job-title"
                autoComplete="organization-title"
                maxLength={80}
                placeholder={t("account.jobTitlePlaceholder")}
                value={values.jobTitle}
                aria-invalid={Boolean(errors.jobTitle)}
                onChange={(e) => set("jobTitle", e.target.value)}
              />
            </Field>
          </div>
        </CardBody>
        <CardFooter>
          <Button type="submit" loading={pending} disabled={!dirty || !values.name.trim()}>
            {t("save")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export function LanguageCard({ current }: { current: "en" | "es" }) {
  const t = useTranslations("settings.account");
  const tCommon = useTranslations("settings");
  const [pending, start] = useTransition();
  const [value, setValue] = useState(current);
  useEffect(() => setValue(current), [current]);
  const options = [
    { code: "en" as const, label: "English" },
    { code: "es" as const, label: "Español" },
  ];
  return (
    <Card>
      <CardHeader title={t("uiLanguage")} description={t("uiLanguageDescription")} />
      <CardBody>
        <fieldset className="flex flex-wrap gap-2" disabled={pending}>
          <legend className="sr-only">{t("uiLanguage")}</legend>
          {options.map((o) => (
            <label
              key={o.code}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-muted/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40",
                value === o.code && "border-brand/50 bg-brand/5 font-medium",
              )}
            >
              <input
                type="radio"
                name="ui-locale"
                value={o.code}
                checked={value === o.code}
                className="accent-[var(--color-brand)]"
                onChange={() => {
                  setValue(o.code);
                  start(async () => {
                    const res = await setUiLocaleAction(o.code);
                    if (!res.ok) {
                      setValue(current);
                      toast.error(res.error);
                    } else toast.success(tCommon("saved"));
                  });
                }}
              />
              <span lang={o.code}>{o.label}</span>
            </label>
          ))}
        </fieldset>
      </CardBody>
    </Card>
  );
}

export function PasswordCard() {
  const t = useTranslations("settings.account");
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    authClient
      .listAccounts()
      .then((res) => {
        if (cancelled) return;
        const list = (res.data ?? []) as { providerId: string }[];
        setHasPassword(res.error ? true : list.some((a) => a.providerId === "credential"));
      })
      .catch(() => !cancelled && setHasPassword(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const errs: Record<string, string> = {};
          if (!current) errs.current = t("passwordRequired");
          if (next.length < 8) errs.next = t("passwordTooShort");
          if (next !== confirm) errs.confirm = t("passwordMismatch");
          setErrors(errs);
          if (Object.keys(errs).length) return;
          start(async () => {
            const res = await authClient.changePassword({
              currentPassword: current,
              newPassword: next,
              revokeOtherSessions: revokeOthers,
            });
            if (res.error) {
              const msg =
                res.error.code === "INVALID_PASSWORD"
                  ? t("passwordWrong")
                  : (res.error.message ?? t("passwordError"));
              setErrors(res.error.code === "INVALID_PASSWORD" ? { current: msg } : {});
              toast.error(msg);
              return;
            }
            setCurrent("");
            setNext("");
            setConfirm("");
            toast.success(t("passwordChanged"));
          });
        }}
      >
        <CardHeader title={t("password")} description={t("passwordDescription")} />
        {hasPassword === false ? (
          <CardBody className="flex items-start gap-3 text-[13px] text-fg-muted">
            <KeyRound className="mt-0.5 size-4 shrink-0" />
            <p>
              {t("noPassword")}{" "}
              <Link href="/forgot-password" className="font-medium text-brand hover:underline">
                {t("setPassword")}
              </Link>
            </p>
          </CardBody>
        ) : (
          <>
            <CardBody className="grid gap-4">
              <input
                type="text"
                autoComplete="username"
                className="hidden"
                readOnly
                aria-hidden
                tabIndex={-1}
              />
              <Field
                label={t("currentPassword")}
                htmlFor="current-password"
                error={errors.current}
                className="sm:max-w-sm"
              >
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={current}
                  aria-invalid={Boolean(errors.current)}
                  onChange={(e) => setCurrent(e.target.value)}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t("newPassword")}
                  htmlFor="new-password"
                  error={errors.next}
                  hint={t("passwordHint")}
                >
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    value={next}
                    aria-invalid={Boolean(errors.next)}
                    onChange={(e) => setNext(e.target.value)}
                  />
                </Field>
                <Field
                  label={t("confirmPassword")}
                  htmlFor="confirm-password"
                  error={errors.confirm}
                >
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    aria-invalid={Boolean(errors.confirm)}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={revokeOthers}
                  onChange={(e) => setRevokeOthers(e.target.checked)}
                  className="size-4 accent-[var(--color-brand)]"
                />
                {t("revokeOthersOnChange")}
              </label>
            </CardBody>
            <CardFooter>
              <Button type="submit" loading={pending} disabled={!current || !next || !confirm}>
                {t("changePassword")}
              </Button>
            </CardFooter>
          </>
        )}
      </form>
    </Card>
  );
}

export function SessionsCard() {
  const t = useTranslations("settings.account");
  return (
    <Card>
      <CardBody className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <MonitorSmartphone className="mt-0.5 size-5 shrink-0 text-fg-muted" />
          <div className="grid gap-0.5">
            <p className="text-sm font-medium">{t("sessions")}</p>
            <p className="text-[13px] text-fg-muted">{t("sessionsDescription")}</p>
          </div>
        </div>
        <ConfirmDialog
          tone="primary"
          trigger={
            <Button type="button" variant="secondary">
              {t("signOutOthers")}
            </Button>
          }
          title={t("signOutOthersTitle")}
          description={t("signOutOthersDescription")}
          confirmLabel={t("signOutOthers")}
          onConfirm={async () => {
            const res = await authClient.revokeOtherSessions();
            if (res.error) {
              toast.error(res.error.message ?? t("passwordError"));
              return false;
            }
            toast.success(t("signedOutOthers"));
          }}
        />
      </CardBody>
    </Card>
  );
}

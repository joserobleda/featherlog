"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { GoogleButton } from "./login-form";

export function SignupForm({
  next,
  googleEnabled,
  defaultEmail,
  inviteToken,
  requireVerification,
}: {
  next: string;
  googleEnabled: boolean;
  defaultEmail?: string;
  inviteToken?: string;
  requireVerification: boolean;
}) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await authClient.signUp.email({
      name,
      email,
      password,
      callbackURL: next,
      ...(inviteToken ? { inviteToken } : {}),
    } as Parameters<typeof authClient.signUp.email>[0]);
    setLoading(false);
    if (error) {
      setError(error.status === 403 ? t("signupDisabled") : (error.message ?? null));
      return;
    }
    if (requireVerification) router.push(`/verify?email=${encodeURIComponent(email)}`);
    else {
      router.push(next);
      router.refresh();
    }
  }

  return (
    <div className="grid gap-4">
      {googleEnabled ? (
        <>
          <GoogleButton next={next} />
          <div className="flex items-center gap-3 text-xs text-fg-muted">
            <span className="h-px flex-1 bg-border" />
            {t("orContinueWith")}
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}
      <form onSubmit={onSubmit} className="grid gap-4">
        <Field label={t("name")} htmlFor="name">
          <Input
            id="name"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={t("email")} htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label={t("password")} htmlFor="password" hint={t("passwordHint")}>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" loading={loading}>
          {t("signUp")}
        </Button>
      </form>
    </div>
  );
}

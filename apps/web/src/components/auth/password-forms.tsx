"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

export function ForgotForm() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  if (sent) return <p className="text-center text-sm text-fg-muted">{t("resetSent")}</p>;
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
        setLoading(false);
        setSent(true);
      }}
    >
      <Field label={t("email")} htmlFor="email">
        <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Button type="submit" loading={loading}>
        {t("sendReset")}
      </Button>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const t = useTranslations("auth");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (done)
    return (
      <div className="grid gap-4 text-center text-sm">
        <p className="text-fg-muted">{t("resetDone")}</p>
        <Button asChild>
          <Link href="/login">{t("signIn")}</Link>
        </Button>
      </div>
    );
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        const { error } = await authClient.resetPassword({ newPassword: password, token });
        setLoading(false);
        if (error) setError(error.message ?? null);
        else setDone(true);
      }}
    >
      <Field label={t("newPassword")} htmlFor="password" hint={t("passwordHint")}>
        <Input id="password" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" loading={loading}>
        {t("setPassword")}
      </Button>
    </form>
  );
}

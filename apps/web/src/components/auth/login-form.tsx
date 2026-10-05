"use client";
import { Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

export function GoogleButton({ next }: { next: string }) {
  const t = useTranslations("auth");
  return (
    <Button
      type="button"
      variant="secondary"
      className="w-full"
      onClick={() => authClient.signIn.social({ provider: "google", callbackURL: next })}
    >
      <svg viewBox="0 0 24 24" aria-hidden className="size-4">
        <path
          fill="#EA4335"
          d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z"
        />
      </svg>
      {t("google")}
    </Button>
  );
}

export function LoginForm({ next, googleEnabled }: { next: string; googleEnabled: boolean }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState<"password" | "magic" | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading("password");
    const { data, error } = await authClient.signIn.email({ email, password, callbackURL: next });
    setLoading(null);
    if (error) {
      if (error.status === 403) router.push(`/verify?email=${encodeURIComponent(email)}`);
      else setError(error.message || t("invalidCredentials"));
      return;
    }
    // During an OAuth authorization (e.g. an MCP client) the server answers with where to continue.
    const redirectUrl = (data as { url?: string; redirect?: boolean } | null)?.url;
    if (redirectUrl) {
      window.location.href = redirectUrl;
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function sendMagicLink() {
    setError(null);
    if (!email) {
      setError(t("email"));
      return;
    }
    setLoading("magic");
    const { error } = await authClient.signIn.magicLink({ email, callbackURL: next });
    setLoading(null);
    if (error) setError(error.message ?? null);
    else setInfo(t("magicLinkSent"));
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
        <Field
          label={
            <span className="flex items-center justify-between">
              {t("password")}
              <Link
                href="/forgot-password"
                className="text-xs font-normal text-brand hover:underline"
              >
                {t("forgot")}
              </Link>
            </span>
          }
          htmlFor="password"
        >
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="text-sm text-success" role="status">
            {info}
          </p>
        ) : null}
        <Button type="submit" loading={loading === "password"} disabled={!password}>
          {t("signIn")}
        </Button>
        <Button type="button" variant="ghost" onClick={sendMagicLink} loading={loading === "magic"}>
          <Mail /> {t("magicLink")}
        </Button>
      </form>
    </div>
  );
}

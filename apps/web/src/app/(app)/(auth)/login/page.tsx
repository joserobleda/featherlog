import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { env } from "@/lib/env";
import { getSession } from "@/lib/session";

export const metadata = { title: "Sign in" };

const safeNext = (n?: string) => (n?.startsWith("/") && !n.startsWith("//") ? n : "/app");

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = safeNext(next);
  if (await getSession()) redirect(target);
  const t = await getTranslations("auth");
  return (
    <AuthShell
      title={t("loginTitle")}
      subtitle={t("loginSubtitle")}
      footer={
        env.SIGNUP_MODE !== "closed" ? (
          <>
            {t("noAccount")}{" "}
            <Link
              className="font-medium text-brand hover:underline"
              href={`/signup${next ? `?next=${encodeURIComponent(target)}` : ""}`}
            >
              {t("signUp")}
            </Link>
          </>
        ) : null
      }
    >
      <LoginForm next={target} googleEnabled={env.googleEnabled} emailEnabled={env.emailEnabled} />
    </AuthShell>
  );
}

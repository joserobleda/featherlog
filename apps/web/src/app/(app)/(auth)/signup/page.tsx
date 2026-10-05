import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";
import { env } from "@/lib/env";
import { getSession } from "@/lib/session";

export const metadata = { title: "Sign up" };

const safeNext = (n?: string) => (n?.startsWith("/") && !n.startsWith("//") ? n : "/app");

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string; invite?: string }>;
}) {
  const { next, email, invite } = await searchParams;
  const target = safeNext(next);
  if (await getSession()) redirect(target);
  const t = await getTranslations("auth");
  return (
    <AuthShell
      title={t("signupTitle")}
      subtitle={t("signupSubtitle")}
      footer={
        <>
          {t("haveAccount")}{" "}
          <Link
            className="font-medium text-brand hover:underline"
            href={`/login${next ? `?next=${encodeURIComponent(target)}` : ""}`}
          >
            {t("signIn")}
          </Link>
        </>
      }
    >
      <SignupForm
        next={target}
        googleEnabled={env.googleEnabled}
        defaultEmail={email}
        inviteToken={invite}
        requireVerification={env.NODE_ENV === "production" && env.emailEnabled}
      />
    </AuthShell>
  );
}

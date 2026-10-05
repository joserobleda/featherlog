import { MailCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata = { title: "Verify your email" };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  const t = await getTranslations("auth");
  return (
    <AuthShell title={t("verifyTitle")}>
      <div className="grid justify-items-center gap-4 text-center">
        <MailCheck className="size-10 text-brand" />
        <p className="text-sm text-fg-muted">{t("verifySubtitle", { email: email ?? "" })}</p>
      </div>
    </AuthShell>
  );
}

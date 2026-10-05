import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetForm } from "@/components/auth/password-forms";

export const metadata = { title: "Choose a new password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const t = await getTranslations("auth");
  return (
    <AuthShell title={t("resetTitle")}>
      {token ? <ResetForm token={token} /> : <p className="text-center text-sm text-danger">{t("inviteInvalid")}</p>}
    </AuthShell>
  );
}

import { getLocale, getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { env } from "@/lib/env";
import { requireSession } from "@/lib/session";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "New workspace" };

export default async function NewWorkspacePage() {
  await requireSession("/app/new");
  const t = await getTranslations("onboarding");
  return (
    <AuthShell title={t("title")} subtitle={t("subtitle")}>
      <OnboardingForm publicBase={env.PUBLIC_URL.replace(/^https?:\/\//, "")} defaultLocale={await getLocale()} />
    </AuthShell>
  );
}

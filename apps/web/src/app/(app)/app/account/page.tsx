import { getUser, listUserWorkspaces } from "@featherlog/core";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Logo } from "@/components/logo";
import { PageHeader } from "@/components/panel/page-header";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { LanguageCard, PasswordCard, ProfileForm, SessionsCard } from "./account-forms";

export async function generateMetadata() {
  const t = await getTranslations("settings.account");
  return { title: t("title") };
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ ws?: string }>;
}) {
  const { ws } = await searchParams;
  const session = await requireSession(`/app/account${ws ? `?ws=${encodeURIComponent(ws)}` : ""}`);
  const [user, workspaces, t, locale] = await Promise.all([
    getUser(db, session.user.id),
    listUserWorkspaces(db, session.user.id),
    getTranslations("settings.account"),
    getLocale(),
  ]);
  // Only link back to a workspace the user actually belongs to.
  const back = workspaces.find((w) => w.workspace.slug === ws)?.workspace;

  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-5 sm:px-8">
          <Link
            href={back ? `/app/${back.slug}` : "/app"}
            className="inline-flex items-center gap-1.5 rounded-md text-sm text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            <ArrowLeft className="size-4" />
            {back ? t("backTo", { name: back.name }) : t("backToApp")}
          </Link>
          <Logo className="text-sm" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
        <PageHeader title={t("title")} description={t("description")} />
        <div className="grid gap-6">
          <ProfileForm
            email={user.email}
            image={user.image}
            initial={{
              name: user.name,
              displayName: user.displayName ?? "",
              jobTitle: user.jobTitle ?? "",
            }}
          />
          <LanguageCard current={locale === "es" ? "es" : "en"} />
          <PasswordCard />
          <SessionsCard />
        </div>
      </main>
    </div>
  );
}

import { findInvitation } from "@featherlog/core";
import { MailX } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { AcceptButton, SignOutButton } from "./invite-actions";

export async function generateMetadata() {
  const t = await getTranslations("settings.invite");
  return { title: t("metaTitle") };
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [found, session, t] = await Promise.all([
    findInvitation(db, token),
    getSession(),
    getTranslations("settings.invite"),
  ]);

  if (!found) {
    return (
      <AuthShell title={t("invalidTitle")} subtitle={t("invalidBody")}>
        <div className="grid justify-items-center gap-5">
          <MailX className="size-10 text-fg-muted" aria-hidden />
          <Button asChild variant="secondary" className="w-full">
            <Link href={session ? "/app" : "/login"}>{session ? t("goToApp") : t("signIn")}</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  const { invitation, workspace } = found;
  const next = `/invite/${token}`;
  const roleLabel = t(`role.${invitation.role as "owner" | "admin" | "editor"}`);
  const subtitle = t.rich("subtitle", {
    workspace: workspace.name,
    role: roleLabel,
    b: (chunks) => <strong className="font-semibold text-fg">{chunks}</strong>,
  });

  if (!session) {
    return (
      <AuthShell title={t("title", { workspace: workspace.name })} subtitle={subtitle}>
        <div className="grid gap-3">
          <p className="text-center text-[13px] text-fg-muted">
            {t("sentTo", { email: invitation.email })}
          </p>
          <Button asChild size="lg" className="w-full">
            <Link
              href={`/signup?email=${encodeURIComponent(invitation.email)}&invite=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`}
            >
              {t("createAccount")}
            </Link>
          </Button>
          <Button asChild variant="secondary" className="w-full">
            <Link href={`/login?next=${encodeURIComponent(next)}`}>{t("haveAccount")}</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  const sameEmail = session.user.email.toLowerCase() === invitation.email.toLowerCase();
  if (!sameEmail) {
    return (
      <AuthShell title={t("title", { workspace: workspace.name })} subtitle={subtitle}>
        <div className="grid gap-4">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[13px] text-amber-800 dark:text-amber-300">
            {t("wrongAccount", { invited: invitation.email, current: session.user.email })}
          </div>
          <SignOutButton />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("title", { workspace: workspace.name })} subtitle={subtitle}>
      <div className="grid gap-3">
        <p className="text-center text-[13px] text-fg-muted">
          {t("signedInAs", { email: session.user.email })}
        </p>
        <AcceptButton token={token} />
      </div>
    </AuthShell>
  );
}

import { CheckCircle2, MailX } from "lucide-react";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { fill, newsletterStrings } from "@/lib/newsletter-i18n";
import { resolveUnsubscribeLink, unsubscribeLink } from "@/server/newsletters/unsubscribe";

export const metadata = { title: "Unsubscribe", robots: { index: false } };

type Params = Promise<{ account: string; token: string }>;

export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ done?: string }>;
}) {
  const { account, token } = await params;
  const found = await resolveUnsubscribeLink(account, token);
  if (!found) {
    const t = newsletterStrings("en");
    return (
      <AuthShell title={t.unsubscribeTitle} subtitle={t.invalidLink}>
        <div className="grid justify-items-center">
          <MailX className="size-10 text-fg-muted" aria-hidden />
        </div>
      </AuthShell>
    );
  }
  const { workspace, subscriber } = found;
  const t = newsletterStrings(subscriber.locale ?? workspace.defaultLocale);
  const done = (await searchParams).done === "1" || subscriber.status !== "subscribed";
  if (done) {
    return (
      <AuthShell
        title={t.unsubscribedTitle}
        subtitle={fill(t.unsubscribedBody, { workspace: workspace.name })}
      >
        <div className="grid justify-items-center">
          <CheckCircle2 className="size-10 text-green-600" aria-hidden />
        </div>
      </AuthShell>
    );
  }

  async function confirm() {
    "use server";
    await unsubscribeLink(account, token);
    redirect(`/unsubscribe/${account}/${token}?done=1`);
  }

  return (
    <AuthShell
      title={t.unsubscribeTitle}
      subtitle={fill(t.unsubscribeBody, { email: subscriber.email, workspace: workspace.name })}
    >
      <form action={confirm}>
        <Button type="submit" size="lg" className="w-full">
          {t.unsubscribeButton}
        </Button>
      </form>
    </AuthShell>
  );
}

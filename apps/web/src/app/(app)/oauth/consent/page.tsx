import { schema } from "@featherlog/db";
import { eq } from "drizzle-orm";
import { ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { ConsentButtons } from "./consent-buttons";

export const metadata = { title: "Authorize application" };

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams(
    Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"),
  );
  const session = await requireSession(`/oauth/consent?${qs.toString()}`);
  const t = await getTranslations("oauth");
  const [client] = sp.client_id
    ? await db
        .select({
          name: schema.oauthClient.name,
          icon: schema.oauthClient.icon,
          uri: schema.oauthClient.uri,
        })
        .from(schema.oauthClient)
        .where(eq(schema.oauthClient.clientId, sp.client_id))
    : [];
  const clientName = client?.name || t("unknownClient");
  const scopes = (sp.scope ?? "").split(" ").filter(Boolean);

  return (
    <AuthShell
      title={t("title", { client: clientName })}
      subtitle={t("subtitle", { client: clientName })}
    >
      <div className="grid gap-5">
        <p className="rounded-lg bg-muted px-3 py-2 text-center text-xs text-fg-muted">
          {t("signedInAs", { email: session.user.email })}
        </p>
        <div className="grid gap-2">
          <p className="text-sm font-medium">{t("permissions")}</p>
          <ul className="grid gap-1.5">
            {scopes.map((s) => (
              <li key={s} className="flex items-start gap-2 text-sm text-fg-muted">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" />
                {t.has(`scopes.${s}` as "scopes.openid") ? t(`scopes.${s}` as "scopes.openid") : s}
              </li>
            ))}
          </ul>
        </div>
        <ConsentButtons allowLabel={t("allow")} denyLabel={t("deny")} />
        <p className="text-xs text-fg-muted">{t("footnote")}</p>
      </div>
    </AuthShell>
  );
}

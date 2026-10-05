import type { Metadata } from "next";
import { publicStrings } from "@/lib/public-i18n";
import { localePrefix } from "@/lib/public-urls";
import { PublicShell } from "./_components/shell";
import { checkAccess, requestLocale, requestWorkspace, wsPath } from "./_lib/data";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <h1 className="text-2xl font-bold text-fg">{title}</h1>
      <p className="mt-3 text-fg-muted">{body}</p>
    </div>
  );
}

export default async function PublicNotFound() {
  const ws = await requestWorkspace();
  const locale = await requestLocale(ws);
  const t = publicStrings(locale);
  if (!ws) {
    return (
      <main id="main" className="px-4">
        <Message title={t.notFoundTitle} body={t.notFoundBody} />
      </main>
    );
  }
  const access = await checkAccess(ws, null);
  if (!access.ok) {
    // Don't reveal workspace details (name, logo…) of a private changelog.
    return (
      <main id="main" className="px-4">
        <Message title={t.privateTitle} body={t.privateBody} />
      </main>
    );
  }
  return (
    <PublicShell
      ws={ws}
      locale={locale}
      homeHref={wsPath(ws, localePrefix(ws, locale))}
      titleAsHeading={false}
    >
      <Message title={t.notFoundTitle} body={t.notFoundBody} />
    </PublicShell>
  );
}

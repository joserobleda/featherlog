import { Bot, Globe2, Github, PanelTop } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/session";

export default async function Home() {
  if (await getSession()) redirect("/app");
  const t = await getTranslations("home");
  const features = [
    { icon: PanelTop, text: t("features.widget") },
    { icon: Globe2, text: t("features.i18n") },
    { icon: Bot, text: t("features.api") },
    { icon: Github, text: t("features.oss") },
  ];
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <Logo />
        <Button asChild variant="ghost" size="sm">
          <Link href="/login">{t("signIn")}</Link>
        </Button>
      </header>
      <section className="flex flex-1 flex-col justify-center gap-6 py-16">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{t("tagline")}</h1>
        <p className="max-w-xl text-lg text-fg-muted">{t("description")}</p>
        <div className="flex gap-3">
          <Button asChild size="lg">
            <Link href="/signup">{t("getStarted")}</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <a href="https://github.com/joserobleda/featherlog">GitHub</a>
          </Button>
        </div>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {features.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
              <Icon className="size-4 text-brand" /> {text}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

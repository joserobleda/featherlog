import { localeInfo } from "@featherlog/core";
import type { Metadata, Viewport } from "next";
import "../../globals.css";
import "./public.css";
import { loadWorkspace, requestLocale } from "./_lib/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Changelog",
  // Pages override this; the generator tag is harmless and useful for debugging.
  generator: "Featherlog",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
};

export default async function PublicRootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const found = await loadWorkspace(slug);
  const locale = await requestLocale(found?.workspace ?? null);
  const dir = localeInfo(locale)?.dir ?? "ltr";
  return (
    <html lang={locale} dir={dir}>
      <body className="fl-public min-h-dvh">{children}</body>
    </html>
  );
}

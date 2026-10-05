import Link from "next/link";
import type * as React from "react";
import { Logo } from "@/components/logo";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8">
        <Logo className="text-lg" />
      </Link>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-7 shadow-sm">
        <div className="mb-6 grid gap-1 text-center">
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle ? <p className="text-sm text-fg-muted">{subtitle}</p> : null}
        </div>
        {children}
      </div>
      {footer ? <div className="mt-6 text-sm text-fg-muted">{footer}</div> : null}
    </main>
  );
}

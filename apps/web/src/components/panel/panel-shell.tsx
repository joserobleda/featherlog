"use client";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { type ComponentProps, useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { Sidebar } from "./sidebar";

/** Desktop: fixed sidebar. Mobile: top bar + slide-over navigation. */
export function PanelShell({
  sidebar,
  children,
}: {
  sidebar: ComponentProps<typeof Sidebar>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // biome-ignore lint/correctness/useExhaustiveDependencies: close the drawer whenever the route changes
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-surface px-3 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="rounded-md p-1.5 hover:bg-muted"
        >
          <Menu className="size-5" />
        </button>
        <Logo className="text-sm" />
        <span className="w-8" />
      </header>
      <div className="hidden md:flex">
        <Sidebar {...sidebar} />
      </div>
      {open ? (
        <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true">
          <div className="relative flex h-full">
            <Sidebar {...sidebar} />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="absolute -right-10 top-3 rounded-full bg-surface p-1.5 shadow"
            >
              <X className="size-4" />
            </button>
          </div>
          <button
            type="button"
            aria-label="Close menu"
            className="flex-1 bg-black/40"
            onClick={() => setOpen(false)}
          />
        </div>
      ) : null}
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

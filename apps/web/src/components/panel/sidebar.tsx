"use client";
import {
  Bot,
  Check,
  ChevronsUpDown,
  ExternalLink,
  FileText,
  Globe2,
  KeyRound,
  Languages,
  LogOut,
  PanelTop,
  Plus,
  Settings,
  Tags,
  User,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Avatar } from "@/components/ui/avatar";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type Ws = { slug: string; name: string; logoUrl: string | null };

export function Sidebar({
  current,
  workspaces,
  user,
  publicUrl,
  canManage,
  uiLocale,
}: {
  current: Ws;
  workspaces: Ws[];
  user: { name: string; email: string; image: string | null };
  publicUrl: string;
  canManage: boolean;
  uiLocale: string;
}) {
  const t = useTranslations("nav");
  const tAuth = useTranslations("auth");
  const pathname = usePathname();
  const router = useRouter();
  const base = `/app/${current.slug}`;

  useEffect(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: tiny preference cookie
    document.cookie = `fl_last_ws=${current.slug}; path=/; max-age=31536000; samesite=lax`;
  }, [current.slug]);

  const settings = [
    { href: `${base}/settings/general`, label: t("general"), icon: Settings, admin: true },
    { href: `${base}/settings/public-page`, label: t("publicPage"), icon: Globe2, admin: true },
    { href: `${base}/settings/widget`, label: t("widget"), icon: PanelTop, admin: true },
    { href: `${base}/settings/categories`, label: t("categories"), icon: Tags, admin: true },
    { href: `${base}/settings/languages`, label: t("languages"), icon: Languages, admin: true },
    { href: `${base}/settings/team`, label: t("team"), icon: Users, admin: false },
    { href: `${base}/settings/api`, label: t("api"), icon: Bot, admin: true },
  ].filter((s) => canManage || !s.admin);

  const link = (href: string, label: string, Icon: typeof FileText, exact = false) => {
    const active = exact ? pathname === href : pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-fg-muted transition-colors hover:bg-muted hover:text-fg",
          active && "bg-muted font-medium text-fg",
        )}
      >
        <Icon className="size-4" />
        {label}
      </Link>
    );
  };

  function setUiLocale(locale: string) {
    // biome-ignore lint/suspicious/noDocumentCookie: tiny preference cookie
    document.cookie = `fl_ui_locale=${locale}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div className="p-3">
        <Dropdown>
          <DropdownTrigger className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-muted">
            <Avatar name={current.name} image={current.logoUrl} size={28} className="rounded-md" />
            <span className="flex-1 truncate text-sm font-semibold">{current.name}</span>
            <ChevronsUpDown className="size-4 text-fg-muted" />
          </DropdownTrigger>
          <DropdownContent align="start" className="w-56">
            <DropdownLabel>{t("workspaces")}</DropdownLabel>
            {workspaces.map((w) => (
              <DropdownItem key={w.slug} onSelect={() => router.push(`/app/${w.slug}/posts`)}>
                <Avatar name={w.name} image={w.logoUrl} size={20} className="rounded" />
                <span className="flex-1 truncate">{w.name}</span>
                {w.slug === current.slug ? <Check /> : null}
              </DropdownItem>
            ))}
            <DropdownSeparator />
            <DropdownItem onSelect={() => router.push("/app/new")}>
              <Plus /> {t("newWorkspace")}
            </DropdownItem>
          </DropdownContent>
        </Dropdown>
      </div>
      <nav className="grid gap-0.5 px-3">
        {link(`${base}/posts`, t("posts"), FileText)}
        <a
          href={publicUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-fg-muted hover:bg-muted hover:text-fg"
        >
          <ExternalLink className="size-4" />
          {t("viewPublic")}
        </a>
      </nav>
      <div className="mt-6 px-5 pb-1 text-xs font-medium uppercase tracking-wide text-fg-muted/80">
        {t("settings")}
      </div>
      <nav className="grid gap-0.5 px-3">{settings.map((s) => link(s.href, s.label, s.icon))}</nav>
      <div className="mt-auto border-t border-border p-3">
        <Dropdown>
          <DropdownTrigger className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-muted">
            <Avatar name={user.name} image={user.image} size={28} />
            <span className="grid flex-1 leading-tight">
              <span className="truncate text-sm font-medium">{user.name}</span>
              <span className="truncate text-xs text-fg-muted">{user.email}</span>
            </span>
          </DropdownTrigger>
          <DropdownContent align="start" side="top" className="w-56">
            <DropdownItem onSelect={() => router.push(`/app/account?ws=${current.slug}`)}>
              <User /> {t("account")}
            </DropdownItem>
            <DropdownItem onSelect={() => setUiLocale(uiLocale === "es" ? "en" : "es")}>
              <Languages /> {uiLocale === "es" ? "English" : "Español"}
            </DropdownItem>
            <DropdownItem asChild>
              <a href="/api/docs" target="_blank" rel="noreferrer">
                <KeyRound /> API docs
              </a>
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem
              onSelect={async () => {
                await authClient.signOut();
                router.push("/login");
                router.refresh();
              }}
            >
              <LogOut /> {tAuth("signOut")}
            </DropdownItem>
          </DropdownContent>
        </Dropdown>
      </div>
    </aside>
  );
}

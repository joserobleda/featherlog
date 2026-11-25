"use client";
import type { SubscriberStatus } from "@featherlog/core";
import { MailX, RotateCcw, Search, Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/settings/confirm-dialog";
import { useActionRunner } from "@/components/settings/use-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { removeSubscriberAction, setSubscriberStatusAction } from "./actions";

export type SubscriberRow = {
  id: string;
  email: string;
  name: string | null;
  externalId: string | null;
  language: string | null;
  status: SubscriberStatus;
  source: string;
  createdAt: string;
  unsubscribedAt: string | null;
};

const TONE: Record<SubscriberStatus, "success" | "neutral" | "danger"> = {
  subscribed: "success",
  unsubscribed: "neutral",
  bounced: "danger",
};

export function SubscriberSearch({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  // biome-ignore lint/correctness/useExhaustiveDependencies: debounce only on the search text
  useEffect(() => {
    const id = setTimeout(() => {
      if ((params.get("q") ?? "") === q) return;
      const next = new URLSearchParams(params.toString());
      next.delete("cursor");
      if (q) next.set("q", q);
      else next.delete("q");
      const s = next.toString();
      router.replace(s ? `${pathname}?${s}` : pathname);
    }, 300);
    return () => clearTimeout(id);
  }, [q]);
  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted" />
      <Input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-9"
      />
    </div>
  );
}

export function SubscriberList({ wsSlug, items }: { wsSlug: string; items: SubscriberRow[] }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {items.map((s) => (
        <SubscriberItem key={s.id} wsSlug={wsSlug} s={s} />
      ))}
    </ul>
  );
}

function SubscriberItem({ wsSlug, s }: { wsSlug: string; s: SubscriberRow }) {
  const t = useTranslations("settings.subscribers");
  const format = useFormatter();
  const { pending, run } = useActionRunner();
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" });
  const meta = [
    s.name,
    s.language ?? t("defaultLanguage"),
    s.externalId ? `#${s.externalId}` : null,
    t(`source.${s.source as "api"}`),
    s.status === "subscribed" || !s.unsubscribedAt
      ? t("since", { date: date(s.createdAt) })
      : t("unsubscribedOn", { date: date(s.unsubscribedAt) }),
  ].filter(Boolean);

  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3 sm:flex-nowrap">
      <div className="grid min-w-0 flex-1 gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{s.email}</span>
          <Badge tone={TONE[s.status]}>{t(`status.${s.status}`)}</Badge>
        </div>
        <span className="truncate text-[13px] text-fg-muted">{meta.join(" · ")}</span>
      </div>
      <div className="flex items-center gap-1">
        {s.status === "subscribed" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-fg-muted"
            aria-label={t("unsubscribe")}
            title={t("unsubscribe")}
            loading={pending}
            onClick={() =>
              run(() => setSubscriberStatusAction(wsSlug, s.id, "unsubscribed"), {
                success: t("unsubscribed", { email: s.email }),
              })
            }
          >
            {pending ? null : <MailX />}
          </Button>
        ) : (
          <ConfirmDialog
            tone="primary"
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-fg-muted"
                aria-label={t("resubscribe")}
                title={t("resubscribe")}
              >
                <RotateCcw />
              </Button>
            }
            title={t("resubscribeTitle", { email: s.email })}
            description={t("resubscribeDescription")}
            confirmLabel={t("resubscribe")}
            onConfirm={async () => {
              const res = await setSubscriberStatusAction(wsSlug, s.id, "subscribed");
              if (!res.ok) {
                toast.error(res.error);
                return false;
              }
              toast.success(t("resubscribed", { email: s.email }));
            }}
          />
        )}
        <ConfirmDialog
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-fg-muted hover:text-danger"
              aria-label={t("delete")}
              title={t("delete")}
            >
              <Trash2 />
            </Button>
          }
          title={t("deleteTitle", { email: s.email })}
          description={t("deleteDescription")}
          confirmLabel={t("delete")}
          onConfirm={async () => {
            const res = await removeSubscriberAction(wsSlug, s.id);
            if (!res.ok) {
              toast.error(res.error);
              return false;
            }
            toast.success(t("deleted", { email: s.email }));
          }}
        />
      </div>
    </li>
  );
}

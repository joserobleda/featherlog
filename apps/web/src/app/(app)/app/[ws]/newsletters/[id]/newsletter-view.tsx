"use client";
import type { NewsletterStatus } from "@featherlog/core/client";
import { Eye, Loader2, RefreshCw, Save, Send, Sparkles, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MarkdownEditor } from "@/components/editor/markdown-editor";
import { ConfirmDialog } from "@/components/settings/confirm-dialog";
import { useActionRunner } from "@/components/settings/use-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  deleteNewsletterAction,
  previewNewsletterAction,
  regenerateNewsletterAction,
  removeNewsletterPostAction,
  saveNewsletterTranslationAction,
  sendNewsletterAction,
  sendTestNewsletterAction,
} from "../actions";

type Tr = { subject: string; preheader: string; contentMd: string };

type Props = {
  wsSlug: string;
  newsletter: {
    id: string;
    status: NewsletterStatus;
    error: string | null;
    version: number;
    recipients: number;
    sentCount: number;
    failedCount: number;
    translations: Record<string, Tr>;
  };
  locales: { code: string; name: string }[];
  defaultLocale: string;
  posts: {
    id: string;
    title: string;
    featured: boolean;
    url: string;
    reads: { widget: number; email: number };
  }[];
  subscriberCount: number;
  skippedReaders: number;
  emailReaders: number;
  emailEnabled: boolean;
};

/** Re-renders the server page every few seconds while something runs in the background. */
function useAutoRefresh(active: boolean, ms: number) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), ms);
    return () => clearInterval(id);
  }, [active, ms, router]);
}

export function NewsletterView(props: Props) {
  const { newsletter: nl } = props;
  const t = useTranslations("newsletters");
  useAutoRefresh(nl.status === "generating" || nl.status === "sending", 3000);

  if (nl.status === "generating")
    return (
      <div className="grid justify-items-center gap-2 rounded-xl border border-border bg-surface px-6 py-16 text-center">
        <Loader2 className="size-6 animate-spin text-brand" />
        <p className="font-medium">{t("generatingTitle")}</p>
        <p className="text-sm text-fg-muted">{t("generatingBody")}</p>
      </div>
    );

  if (nl.status === "failed")
    return (
      <div className="grid gap-3 rounded-xl border border-border bg-surface p-6">
        <p className="font-medium">{t("failedTitle")}</p>
        {nl.error ? <p className="text-sm text-fg-muted">{nl.error}</p> : null}
        <div className="flex gap-2">
          <RegenerateButton {...props} confirm={false} />
          <DeleteButton {...props} />
        </div>
      </div>
    );

  if (nl.status === "sending" || nl.status === "sent")
    return (
      <div className="grid gap-6">
        <div className="rounded-xl border border-border bg-surface p-5 text-sm">
          {nl.status === "sending" ? (
            <p className="mb-1 flex items-center gap-2 font-medium">
              <Loader2 className="size-4 animate-spin" />
              {t("sending", { recipients: nl.recipients })}
            </p>
          ) : null}
          <p className="text-fg-muted">
            {t("progress", {
              sent: nl.sentCount,
              failed: nl.failedCount,
              recipients: nl.recipients,
            })}
          </p>
          {nl.status === "sent" ? (
            <p className="text-fg-muted">{t("emailReaders", { count: props.emailReaders })}</p>
          ) : null}
        </div>
        <ReadOnlyPreview {...props} />
        <PostList {...props} editable={false} />
      </div>
    );

  return <DraftEditor {...props} />;
}

function LocaleTabs({
  locales,
  value,
  onChange,
  has,
}: {
  locales: Props["locales"];
  value: string;
  onChange: (code: string) => void;
  has: (code: string) => boolean;
}) {
  if (locales.length < 2) return null;
  return (
    <nav className="flex flex-wrap gap-1 rounded-lg bg-muted p-1" aria-label="Language">
      {locales.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => onChange(l.code)}
          className={cn(
            "rounded-md px-3 py-1 text-sm text-fg-muted hover:text-fg",
            l.code === value && "bg-surface font-medium text-fg shadow-xs",
            !has(l.code) && "opacity-60",
          )}
          aria-current={l.code === value ? "page" : undefined}
        >
          {l.name}
        </button>
      ))}
    </nav>
  );
}

function Preview({
  wsSlug,
  id,
  locale,
  nonce,
}: {
  wsSlug: string;
  id: string;
  locale: string;
  nonce: number;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `nonce` forces a reload after saving
  useEffect(() => {
    let live = true;
    setError(null);
    previewNewsletterAction(wsSlug, id, locale).then((r) => {
      if (!live) return;
      if (r.ok) setHtml(r.data.html);
      else {
        setHtml(null);
        setError(r.error);
      }
    });
    return () => {
      live = false;
    };
  }, [wsSlug, id, locale, nonce]);
  if (error) return <p className="p-4 text-sm text-fg-muted">{error}</p>;
  if (html === null)
    return (
      <div className="grid h-96 place-items-center">
        <Loader2 className="size-5 animate-spin text-fg-muted" />
      </div>
    );
  return (
    <iframe
      title="Email preview"
      sandbox=""
      srcDoc={html}
      className="h-[640px] w-full rounded-lg border border-border bg-white"
    />
  );
}

function ReadOnlyPreview(props: Props) {
  const available = props.locales.filter((l) => props.newsletter.translations[l.code]);
  const [locale, setLocale] = useState(
    props.newsletter.translations[props.defaultLocale] ? props.defaultLocale : available[0]?.code,
  );
  if (!locale) return null;
  return (
    <div className="grid gap-3">
      <LocaleTabs locales={available} value={locale} onChange={setLocale} has={() => true} />
      <Preview wsSlug={props.wsSlug} id={props.newsletter.id} locale={locale} nonce={0} />
    </div>
  );
}

function PostList({ wsSlug, newsletter, posts, editable }: Props & { editable: boolean }) {
  const t = useTranslations("newsletters");
  return (
    <section className="grid gap-2">
      <h2 className="text-sm font-semibold">{t("posts")}</h2>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {posts.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
            <a
              href={p.url}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate text-sm hover:underline"
            >
              {p.title}
            </a>
            {p.reads.widget + p.reads.email > 0 ? (
              <span
                className="shrink-0 text-[13px] text-fg-muted"
                title={t("readsDetail", { widget: p.reads.widget, email: p.reads.email })}
              >
                {t("reads", { count: p.reads.widget + p.reads.email })}
              </span>
            ) : null}
            <Badge tone={p.featured ? "brand" : "neutral"}>
              {p.featured ? t("featured") : t("brief")}
            </Badge>
            {editable ? (
              <ConfirmDialog
                trigger={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-fg-muted"
                    aria-label={t("removePost")}
                    title={t("removePost")}
                  >
                    <X />
                  </Button>
                }
                title={t("removePost")}
                description={t("removePostDescription")}
                confirmLabel={t("removePost")}
                onConfirm={async () => {
                  const r = await removeNewsletterPostAction(wsSlug, newsletter.id, p.id);
                  if (!r.ok) {
                    toast.error(r.error);
                    return false;
                  }
                }}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RegenerateButton({ wsSlug, newsletter, confirm }: Props & { confirm: boolean }) {
  const t = useTranslations("newsletters");
  const router = useRouter();
  const go = async () => {
    const r = await regenerateNewsletterAction(wsSlug, newsletter.id);
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    router.refresh();
  };
  const button = (
    <Button type="button" variant="secondary" onClick={confirm ? undefined : () => void go()}>
      {confirm ? <Sparkles /> : <RefreshCw />} {confirm ? t("regenerate") : t("retry")}
    </Button>
  );
  if (!confirm) return button;
  return (
    <ConfirmDialog
      tone="primary"
      trigger={button}
      title={t("regenerateTitle")}
      description={t("regenerateDescription")}
      confirmLabel={t("regenerate")}
      onConfirm={go}
    />
  );
}

function DeleteButton({ wsSlug, newsletter }: Props) {
  const t = useTranslations("newsletters");
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="ghost" className="text-fg-muted hover:text-danger">
          <Trash2 /> {t("delete")}
        </Button>
      }
      title={t("deleteTitle")}
      description={t("deleteDescription")}
      confirmLabel={t("delete")}
      onConfirm={async () => {
        const r = await deleteNewsletterAction(wsSlug, newsletter.id);
        if (!r.ok) {
          toast.error(r.error);
          return false;
        }
        toast.success(t("deleted"));
        router.push(`/app/${wsSlug}/newsletters`);
      }}
    />
  );
}

function DraftEditor(props: Props) {
  const { wsSlug, newsletter: nl, locales, defaultLocale } = props;
  const t = useTranslations("newsletters");
  const router = useRouter();
  const [locale, setLocale] = useState(defaultLocale);
  const [saved, setSaved] = useState<Record<string, Tr>>(nl.translations);
  const [drafts, setDrafts] = useState<Record<string, Tr>>(nl.translations);
  const [version, setVersion] = useState(nl.version);
  const [nonce, setNonce] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const save = useActionRunner();
  const test = useActionRunner();

  useEffect(() => {
    setSaved(nl.translations);
    setDrafts(nl.translations);
    setVersion(nl.version);
  }, [nl.translations, nl.version]);

  const current = drafts[locale];
  const dirtyLocales = locales
    .map((l) => l.code)
    .filter((code) => JSON.stringify(drafts[code]) !== JSON.stringify(saved[code]));
  const dirty = dirtyLocales.includes(locale);
  const languageName = locales.find((l) => l.code === locale)?.name ?? locale;
  const update = (patch: Partial<Tr>) =>
    setDrafts((d) => ({
      ...d,
      [locale]: { subject: "", preheader: "", contentMd: "", ...d[locale], ...patch },
    }));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <LocaleTabs
          locales={locales}
          value={locale}
          onChange={setLocale}
          has={(code) => Boolean(drafts[code])}
        />
        <div className="flex flex-wrap items-center gap-2">
          <RegenerateButton {...props} confirm />
          <Button
            type="button"
            variant="secondary"
            disabled={!props.emailEnabled || dirty || !saved[locale]}
            loading={test.pending}
            onClick={() =>
              test.run(() => sendTestNewsletterAction(wsSlug, nl.id, locale), {
                onSuccess: (d) => toast.success(t("testSent", { email: d.to })),
              })
            }
          >
            {test.pending ? null : <Send />} {t("sendTest")}
          </Button>
          <ConfirmDialog
            tone="primary"
            trigger={
              <Button
                type="button"
                disabled={
                  !props.emailEnabled ||
                  dirtyLocales.length > 0 ||
                  Object.keys(saved).length === 0 ||
                  props.subscriberCount === 0
                }
              >
                <Send /> {t("send")}
              </Button>
            }
            title={t("sendTitle")}
            description={
              props.skippedReaders > 0
                ? `${t("sendDescription", { count: props.subscriberCount })} ${t("skippedReaders", { count: props.skippedReaders })}`
                : t("sendDescription", { count: props.subscriberCount })
            }
            confirmLabel={t("sendConfirm")}
            onConfirm={async () => {
              const r = await sendNewsletterAction(wsSlug, nl.id);
              if (!r.ok) {
                toast.error(r.error);
                return false;
              }
              router.refresh();
            }}
          />
        </div>
      </div>

      {current ? null : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/60 px-4 py-3 text-sm">
          <span className="text-fg-muted">{t("missingLanguage", { language: languageName })}</span>
          <Button type="button" variant="secondary" size="sm" onClick={() => update({})}>
            {t("createLanguage", { language: languageName })}
          </Button>
        </div>
      )}

      {current ? (
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.run(
              () => saveNewsletterTranslationAction(wsSlug, nl.id, locale, current, version),
              {
                success: t("saved"),
                onSuccess: (d) => {
                  setVersion(d.version);
                  setSaved((s) => ({ ...s, [locale]: current }));
                  setNonce((n) => n + 1);
                },
              },
            );
          }}
        >
          <Field label={t("subject")} htmlFor="nl-subject" error={save.errors.subject}>
            <Input
              id="nl-subject"
              value={current.subject}
              maxLength={200}
              onChange={(e) => update({ subject: e.target.value })}
            />
          </Field>
          <Field label={t("preheader")} htmlFor="nl-preheader" hint={t("preheaderHint")}>
            <Input
              id="nl-preheader"
              value={current.preheader}
              maxLength={250}
              onChange={(e) => update({ preheader: e.target.value })}
            />
          </Field>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">{t("content")}</span>
            <div className="overflow-hidden rounded-lg border border-border">
              <MarkdownEditor
                key={locale}
                value={current.contentMd}
                onChange={(v) => update({ contentMd: v })}
                ariaLabel={t("content")}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={save.pending} disabled={!dirty}>
              {save.pending ? null : <Save />} {t("save")}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowPreview((v) => !v)}>
              <Eye /> {t("preview")}
            </Button>
            {dirty ? <span className="text-[13px] text-fg-muted">{t("unsaved")}</span> : null}
          </div>
        </form>
      ) : null}

      {showPreview && saved[locale] ? (
        <Preview wsSlug={wsSlug} id={nl.id} locale={locale} nonce={nonce} />
      ) : null}

      <PostList {...props} editable />
      <div>
        <DeleteButton {...props} />
      </div>
    </div>
  );
}

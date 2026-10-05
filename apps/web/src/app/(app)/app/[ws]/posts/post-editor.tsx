"use client";
import {
  ArrowLeft,
  Bold,
  CalendarClock,
  ChevronDown,
  Code,
  ExternalLink,
  Heading2,
  HelpCircle,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  SquareCode,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { MarkdownEditor, type MarkdownEditorHandle } from "@/components/editor/markdown-editor";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { deletePostAction, type SavePostInput, savePostAction } from "./actions";

type Translation = { title: string; contentMd: string };

export type EditorProps = {
  workspace: {
    slug: string;
    name: string;
    logoUrl: string | null;
    accentColor: string;
    defaultLocale: string;
    locales: { code: string; name: string; dir: "ltr" | "rtl" }[];
    publicBase: string;
  };
  categories: { id: string; color: string; names: Record<string, string> }[];
  members: { id: string; name: string; image: string | null }[];
  canPublish: boolean;
  initial: {
    id?: string;
    version?: number;
    publicId?: string;
    translations: Record<string, Translation>;
    publishedAt: string | null;
    published: boolean;
    authorId: string | null;
    createdVia?: string;
    actorLabel?: string | null;
    slugs?: Record<string, string>;
  };
};

const hasContent = (t?: Translation) => Boolean(t && (t.title.trim() || t.contentMd.trim()));

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PostEditor({ workspace, categories, members, canPublish, initial }: EditorProps) {
  const t = useTranslations("posts.editor");
  const tStatus = useTranslations("posts.status");
  const tVia = useTranslations("posts.via");
  const format = useFormatter();
  const router = useRouter();
  const editor = useRef<MarkdownEditorHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [postId, setPostId] = useState(initial.id);
  const [version, setVersion] = useState(initial.version);
  const [publicId, setPublicId] = useState(initial.publicId);
  const [slugs, setSlugs] = useState(initial.slugs ?? {});
  const [translations, setTranslations] = useState<Record<string, Translation>>(initial.translations);
  const [existing, setExisting] = useState(() => new Set(Object.keys(initial.translations)));
  const [locale, setLocale] = useState(
    initial.translations[workspace.defaultLocale] || !Object.keys(initial.translations)[0]
      ? workspace.defaultLocale
      : Object.keys(initial.translations)[0]!,
  );
  const [publishedAt, setPublishedAt] = useState<string | null>(initial.publishedAt);
  const [published, setPublished] = useState(initial.published);
  const [authorId, setAuthorId] = useState<string | null>(initial.authorId);
  const [conflict, setConflict] = useState(false);
  const [pending, startTransition] = useTransition();
  const [autosaveState, setAutosaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [previewHtml, setPreviewHtml] = useState("");
  const [mobileTab, setMobileTab] = useState<"write" | "preview">("write");

  const snapshot = useCallback(
    () => JSON.stringify({ translations, publishedAt, authorId }),
    [translations, publishedAt, authorId],
  );
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    JSON.stringify({ translations: initial.translations, publishedAt: initial.publishedAt, authorId: initial.authorId }),
  );
  const dirty = snapshot() !== savedSnapshot;

  const current = translations[locale] ?? { title: "", contentMd: "" };
  const localeInfo = workspace.locales.find((l) => l.code === locale);
  const defaultName = workspace.locales.find((l) => l.code === workspace.defaultLocale)?.name ?? workspace.defaultLocale;
  const catName = (c: EditorProps["categories"][number]) =>
    c.names[locale] ?? c.names[workspace.defaultLocale] ?? Object.values(c.names)[0] ?? "";
  const isFuture = publishedAt ? new Date(publishedAt).getTime() > Date.now() : false;

  const setCurrent = (patch: Partial<Translation>) =>
    setTranslations((prev) => ({ ...prev, [locale]: { ...(prev[locale] ?? { title: "", contentMd: "" }), ...patch } }));

  /* ---------- live preview ---------- */
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(async () => {
      const { renderMarkdown } = await import("@featherlog/markdown");
      const r = await renderMarkdown(current.contentMd, {
        categories: categories.map((c) => ({ id: c.id, name: catName(c), color: c.color })),
      });
      if (!cancelled) setPreviewHtml(r.html);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.contentMd, locale, categories]);

  /* ---------- saving ---------- */
  const buildPayload = useCallback(
    (publish: boolean): SavePostInput | string => {
      const payload: SavePostInput["translations"] = {};
      for (const { code } of workspace.locales) {
        const tr = translations[code];
        if (hasContent(tr)) {
          if (!tr!.title.trim()) return code;
          payload[code] = { title: tr!.title.trim(), contentMd: tr!.contentMd };
        } else if (existing.has(code)) {
          payload[code] = null;
        }
      }
      if (!Object.values(payload).some(Boolean)) return locale;
      return {
        workspace: workspace.slug,
        id: postId,
        expectedVersion: version,
        translations: payload,
        publishedAt,
        published: publish,
        authorId,
      };
    },
    [workspace, translations, existing, postId, version, publishedAt, authorId, locale],
  );

  const save = useCallback(
    async (publish: boolean, opts: { silent?: boolean } = {}) => {
      const payload = buildPayload(publish);
      if (typeof payload === "string") {
        if (!opts.silent) {
          setLocale(payload);
          toast.error(t("titleRequired"));
        }
        return false;
      }
      const snap = snapshot();
      const res = await savePostAction(payload);
      if (!res.ok) {
        if (res.code === "precondition_failed") setConflict(true);
        else if (!opts.silent) toast.error(res.error);
        return false;
      }
      const p = res.data;
      setPostId(p.id);
      setVersion(p.version);
      setPublicId(p.publicId);
      setSlugs(p.slugs);
      setPublished(p.published);
      setPublishedAt(p.publishedAt);
      setExisting(new Set(Object.keys(p.slugs)));
      setSavedSnapshot(JSON.stringify({ ...JSON.parse(snap), publishedAt: p.publishedAt }));
      // Autosaves keep the URL (changing it would remount the editor mid-typing).
      if (!opts.silent && window.location.pathname.endsWith("/posts/new")) {
        router.replace(`/app/${workspace.slug}/posts/${p.id}`);
      }
      return true;
    },
    [buildPayload, snapshot, postId, workspace.slug, t, router],
  );

  const runSave = (publish: boolean, message: string) =>
    startTransition(async () => {
      if (await save(publish)) {
        toast.success(message);
        router.refresh();
      }
    });

  // Autosave drafts (never live posts: changes to published posts are applied explicitly).
  useEffect(() => {
    if (!dirty || published || initial.published || conflict) return;
    if (!Object.values(translations).some((x) => x.title.trim())) return;
    const id = setTimeout(async () => {
      setAutosaveState("saving");
      const ok = await save(false, { silent: true });
      setAutosaveState(ok ? "saved" : "idle");
    }, 2500);
    return () => clearTimeout(id);
  }, [dirty, published, initial.published, conflict, translations, save]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        runSave(published, t("saved"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---------- uploads ---------- */
  const uploadFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        const marker = `![${t("uploading")} ${file.name}]()`;
        editor.current?.insertBlock(marker);
        const body = new FormData();
        body.set("file", file);
        body.set("workspace", workspace.slug);
        try {
          const r = await fetch("/api/uploads", { method: "POST", body });
          const json = (await r.json()) as { url?: string; error?: string };
          if (!r.ok || !json.url) throw new Error(json.error ?? t("uploadFailed"));
          const alt = file.name.replace(/\.[^.]+$/, "").replace(/[[\]]/g, "");
          editor.current?.replaceText(marker, `![${alt}](${json.url})`);
        } catch (err) {
          editor.current?.replaceText(marker, "");
          toast.error(err instanceof Error ? err.message : t("uploadFailed"));
        }
      }
    },
    [workspace.slug, t],
  );

  /* ---------- categories present in the current translation ---------- */
  const presentCategories = useMemo(() => {
    const names = new Set<string>();
    for (const line of current.contentMd.split("\n")) {
      const m = /^\s*((?:\[[^\]\n]+\]\s*)+)$/.exec(line);
      if (m) for (const x of m[1]!.matchAll(/\[([^\]]+)\]/g)) names.add(x[1]!.trim().toLowerCase());
    }
    return categories.filter((c) => names.has(catName(c).toLowerCase()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.contentMd, categories, locale]);

  const removeCategory = (name: string) => {
    const re = new RegExp(`\\[${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\s?`, "i");
    const lines = current.contentMd.split("\n").map((line) => (/^\s*(\[[^\]\n]+\]\s*)+$/.test(line) ? line.replace(re, "").trimEnd() : line));
    setCurrent({ contentMd: lines.join("\n").replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n") });
  };

  const liveUrl =
    publicId && slugs[locale] && published && !isFuture
      ? `${workspace.publicBase}/${workspace.slug}${locale === workspace.defaultLocale ? "" : `/${locale}`}/${slugs[locale]}-${publicId}`
      : null;

  const status = !published ? "draft" : isFuture ? "scheduled" : "published";

  /* ---------- render ---------- */
  const toolbar = [
    { icon: Heading2, label: t("toolbar.heading"), run: () => editor.current?.linePrefix("## ") },
    { icon: Bold, label: t("toolbar.bold"), run: () => editor.current?.wrap("**", "**", "bold") },
    { icon: Italic, label: t("toolbar.italic"), run: () => editor.current?.wrap("_", "_", "italic") },
    { icon: Link2, label: t("toolbar.link"), run: () => editor.current?.wrap("[", "](https://)", "text") },
    { icon: ImagePlus, label: t("toolbar.image"), run: () => fileInput.current?.click() },
    { icon: List, label: t("toolbar.bulletList"), run: () => editor.current?.linePrefix("- ") },
    { icon: ListOrdered, label: t("toolbar.numberedList"), run: () => editor.current?.linePrefix("1. ") },
    { icon: Quote, label: t("toolbar.quote"), run: () => editor.current?.linePrefix("> ") },
    { icon: Code, label: t("toolbar.code"), run: () => editor.current?.wrap("`", "`", "code") },
    { icon: SquareCode, label: t("toolbar.codeBlock"), run: () => editor.current?.insertBlock("```\ncode\n```") },
  ];

  return (
    <div className="flex h-dvh flex-col">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/app/${workspace.slug}/posts`}>
            <ArrowLeft /> {t("back")}
          </Link>
        </Button>
        <Badge tone={status === "published" ? "success" : status === "scheduled" ? "warning" : "neutral"}>{tStatus(status)}</Badge>
        {initial.createdVia && initial.createdVia !== "panel" ? (
          <Badge tone="brand">
            {t("createdVia", { via: tVia(initial.createdVia as "api" | "mcp"), actor: initial.actorLabel ?? "—" })}
          </Badge>
        ) : null}
        <span className="text-xs text-fg-muted" aria-live="polite">
          {conflict ? null : dirty ? t("unsaved") : autosaveState === "saved" ? t("autosaved") : null}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {liveUrl ? (
            <Button asChild variant="ghost" size="sm">
              <a href={liveUrl} target="_blank" rel="noreferrer">
                <ExternalLink /> {t("viewLive")}
              </a>
            </Button>
          ) : null}
          <div className="flex rounded-lg bg-muted p-0.5 lg:hidden">
            {(["write", "preview"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setMobileTab(tab)}
                className={cn("rounded-md px-2.5 py-1 text-xs", mobileTab === tab && "bg-surface shadow-xs")}
              >
                {t(tab)}
              </button>
            ))}
          </div>
        </div>
      </header>

      {conflict ? (
        <div className="flex items-center justify-between gap-4 bg-amber-500/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-300" role="alert">
          {t("conflict")}
          <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
            {t("reload")}
          </Button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {/* Preview (public page look) */}
        <section
          className={cn("min-w-0 flex-1 overflow-y-auto bg-bg px-6 py-10", mobileTab === "write" && "hidden lg:block")}
          style={{ ["--fl-accent" as string]: workspace.accentColor }}
          aria-label={t("preview")}
        >
          <article className="mx-auto max-w-2xl" dir={localeInfo?.dir}>
            <div className="mb-8 flex items-center gap-3 text-sm text-fg-muted">
              <Avatar name={workspace.name} image={workspace.logoUrl} size={32} className="rounded-lg" />
              <span className="font-medium text-fg">{workspace.name}</span>
            </div>
            <time className="text-sm text-fg-muted">
              {format.dateTime(publishedAt ? new Date(publishedAt) : new Date(), { dateStyle: "long" })}
            </time>
            <h1 className={cn("mt-1 text-3xl font-bold tracking-tight", !current.title && "text-fg-muted/50")}>
              {current.title || t("titlePlaceholder")}
            </h1>
            {/* biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by @featherlog/markdown */}
            <div className="fl-prose mt-6" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </article>
        </section>

        {/* Editor panel */}
        <section
          className={cn(
            "flex w-full shrink-0 flex-col border-l border-border bg-surface lg:w-[520px]",
            mobileTab === "preview" && "hidden lg:flex",
          )}
        >
          {/* Locale tabs */}
          {workspace.locales.length > 1 ? (
            <div className="flex gap-1 overflow-x-auto border-b border-border px-3 pt-2" role="tablist" aria-label={t("translations")}>
              {workspace.locales.map((l) => {
                const filled = hasContent(translations[l.code]);
                return (
                  <button
                    key={l.code}
                    type="button"
                    role="tab"
                    aria-selected={l.code === locale}
                    onClick={() => setLocale(l.code)}
                    className={cn(
                      "flex items-center gap-1.5 whitespace-nowrap rounded-t-md border-b-2 px-3 py-2 text-sm",
                      l.code === locale ? "border-brand font-medium text-fg" : "border-transparent text-fg-muted hover:text-fg",
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full", filled ? "bg-success" : "bg-border")} aria-hidden />
                    {l.name}
                    {l.code === workspace.defaultLocale ? <span className="text-[10px] text-fg-muted">★</span> : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {!hasContent(translations[locale]) && locale !== workspace.defaultLocale && hasContent(translations[workspace.defaultLocale]) ? (
              <div className="m-5 grid gap-3 rounded-lg border border-dashed border-border p-4 text-sm">
                <p className="text-fg-muted">{t("missingTranslation", { language: localeInfo?.name ?? locale })}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setCurrent({ ...translations[workspace.defaultLocale]! })}
                  >
                    {t("copyFromDefault", { language: defaultName })}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="px-5 pt-5" dir={localeInfo?.dir}>
              <input
                value={current.title}
                onChange={(e) => setCurrent({ title: e.target.value })}
                placeholder={t("titlePlaceholder")}
                aria-label={t("titlePlaceholder")}
                className="w-full bg-transparent text-xl font-semibold outline-none placeholder:text-fg-muted/50"
                maxLength={200}
              />
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-2 px-5 py-3">
              <Dropdown>
                <DropdownTrigger asChild>
                  <Button variant="secondary" size="sm">
                    <Tag /> {t("categories")} <ChevronDown className="size-3" />
                  </Button>
                </DropdownTrigger>
                <DropdownContent
                  align="start"
                  onCloseAutoFocus={(e) => {
                    e.preventDefault();
                    editor.current?.focus();
                  }}
                >
                  {categories.length === 0 ? (
                    <div className="px-2.5 py-1.5 text-sm text-fg-muted">{t("noCategories")}</div>
                  ) : (
                    categories.map((c) => (
                      <DropdownItem key={c.id} onSelect={() => editor.current?.insertBlock(`[${catName(c)}]`)}>
                        <span className="size-2.5 rounded-full" style={{ background: c.color }} />
                        {catName(c)}
                      </DropdownItem>
                    ))
                  )}
                </DropdownContent>
              </Dropdown>
              {presentCategories.map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-xs font-semibold"
                  style={{ background: c.color, color: "#fff" }}
                >
                  {catName(c)}
                  <button type="button" aria-label={`${t("categories")}: ${catName(c)} ×`} onClick={() => removeCategory(catName(c))} className="rounded-full p-0.5 hover:bg-black/15">
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>

            {/* Toolbar */}
            <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-y border-border bg-surface px-3 py-1.5">
              {toolbar.map(({ icon: Icon, label, run }) => (
                <button
                  key={label}
                  type="button"
                  title={label}
                  aria-label={label}
                  onClick={run}
                  className="rounded-md p-1.5 text-fg-muted hover:bg-muted hover:text-fg"
                >
                  <Icon className="size-4" />
                </button>
              ))}
              <MarkdownHelp label={t("markdownHelp")} />
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                multiple
                hidden
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (files.length) uploadFiles(files);
                }}
              />
            </div>

            <div className="px-5 py-4" dir={localeInfo?.dir}>
              <MarkdownEditor
                ref={editor}
                key={locale}
                value={current.contentMd}
                onChange={(v) => setCurrent({ contentMd: v })}
                placeholder={t("bodyPlaceholder")}
                onUploadFiles={uploadFiles}
              />
            </div>
          </div>

          {/* Footer: author, date, publish */}
          <footer className="grid gap-3 border-t border-border bg-muted/30 px-5 py-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-xs font-medium text-fg-muted">
                {t("author")}
                <Select value={authorId ?? ""} onChange={(e) => setAuthorId(e.target.value || null)}>
                  <option value="">{t("noAuthor")}</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="grid gap-1 text-xs font-medium text-fg-muted">
                <span className="flex items-center gap-1">
                  <CalendarClock className="size-3.5" /> {t("date")}
                </span>
                <div className="flex gap-1">
                  <input
                    type="datetime-local"
                    value={toLocalInput(publishedAt)}
                    onChange={(e) => setPublishedAt(e.target.value ? new Date(e.target.value).toISOString() : null)}
                    className="h-9 w-full rounded-lg border border-border bg-surface px-2 text-sm text-fg"
                  />
                  {publishedAt ? (
                    <button type="button" onClick={() => setPublishedAt(null)} className="rounded-md px-2 text-xs text-fg-muted hover:bg-muted" title={t("now")}>
                      {t("now")}
                    </button>
                  ) : null}
                </div>
              </label>
            </div>
            <div className="flex items-center gap-2">
              {postId ? <DeleteButton workspace={workspace.slug} id={postId} /> : null}
              <div className="flex items-center gap-2 text-xs text-fg-muted">
                <Switch
                  id="published"
                  checked={published}
                  disabled={!canPublish}
                  onCheckedChange={(v) => runSave(v, v ? t("saved") : t("saved"))}
                  aria-label={t("published")}
                />
                <label htmlFor="published" className="leading-tight">
                  <span className="block font-medium text-fg">{t("published")}</span>
                  {published ? (isFuture ? t("scheduledHint") : t("publishedHint")) : t("draftHint")}
                </label>
              </div>
              <div className="ml-auto flex gap-2">
                {!published ? (
                  <>
                    <Button variant="secondary" onClick={() => runSave(false, t("saved"))} loading={pending}>
                      {t("saveDraft")}
                    </Button>
                    {canPublish ? (
                      <Button onClick={() => runSave(true, t("saved"))} loading={pending}>
                        {isFuture ? t("schedule") : t("publish")}
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <Button onClick={() => runSave(true, t("saved"))} loading={pending} disabled={!dirty && !pending}>
                    {t("update")}
                  </Button>
                )}
              </div>
            </div>
          </footer>
        </section>
      </div>
    </div>
  );
}

function DeleteButton({ workspace, id }: { workspace: string; id: string }) {
  const t = useTranslations("posts.editor");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("delete")} title={t("delete")}>
          <Trash2 className="text-danger" />
        </Button>
      </DialogTrigger>
      <DialogContent title={t("delete")} description={t("deleteConfirm")}>
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary">{tc("cancel")}</Button>
          </DialogClose>
          <Button
            variant="danger"
            loading={pending}
            onClick={() =>
              start(async () => {
                const res = await deletePostAction(workspace, id);
                if (!res.ok) toast.error(res.error);
                else router.push(`/app/${workspace}/posts`);
              })
            }
          >
            {tc("delete")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MarkdownHelp({ label }: { label: string }) {
  const [html, setHtml] = useState("");
  return (
    <Dialog
      onOpenChange={async (open) => {
        if (open && !html) {
          const { renderMarkdown, MARKDOWN_GUIDE } = await import("@featherlog/markdown");
          setHtml((await renderMarkdown(MARKDOWN_GUIDE)).html);
        }
      }}
    >
      <DialogTrigger asChild>
        <button type="button" title={label} aria-label={label} className="ml-auto rounded-md p-1.5 text-fg-muted hover:bg-muted hover:text-fg">
          <HelpCircle className="size-4" />
        </button>
      </DialogTrigger>
      <DialogContent title={label} className="max-h-[80vh] max-w-2xl overflow-y-auto">
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: rendered from our own guide */}
        <div className="fl-prose text-sm" dangerouslySetInnerHTML={{ __html: html }} />
      </DialogContent>
    </Dialog>
  );
}


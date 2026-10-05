"use client";
import type { Category } from "@featherlog/core";
import { ArrowDown, ArrowUp, GripVertical, Plus, Tags, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/settings/confirm-dialog";
import { useActionRunner } from "@/components/settings/use-action";
import { CategoryChip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ColorInput } from "@/components/ui/color-input";
import { EmptyState } from "@/components/ui/empty";
import { Field, Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  createCategoryAction,
  deleteCategoryAction,
  reorderCategoriesAction,
  updateCategoryAction,
} from "./actions";

type LocaleOption = { code: string; label: string };
const PALETTE = [
  "#3778FF",
  "#9B51E0",
  "#EB5757",
  "#27AE60",
  "#F2994A",
  "#F2C94C",
  "#2D9CDB",
  "#4F4F4F",
];
const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

export function CategoriesManager({
  wsSlug,
  initial,
  locales,
  defaultLocale,
}: {
  wsSlug: string;
  initial: Category[];
  locales: LocaleOption[];
  defaultLocale: string;
}) {
  const t = useTranslations("settings");
  const [items, setItems] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [, startReorder] = useTransition();
  const beforeDrag = useRef<Category[] | null>(null);

  const persistOrder = (next: Category[], previous: Category[]) => {
    setItems(next);
    startReorder(async () => {
      const res = await reorderCategoriesAction(
        wsSlug,
        next.map((c) => c.id),
      );
      if (!res.ok) {
        setItems(previous);
        toast.error(res.error);
      } else {
        setItems(res.data);
      }
    });
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    persistOrder(next, items);
  };

  const otherLocales = locales.filter((l) => l.code !== defaultLocale);
  const defaultLabel = locales.find((l) => l.code === defaultLocale)?.label ?? defaultLocale;

  return (
    <div className="grid gap-6">
      <CreateCategory wsSlug={wsSlug} onCreated={setItems} />
      <Card>
        <CardHeader
          title={t("categories.listTitle")}
          description={
            otherLocales.length
              ? t("categories.listDescriptionLocales")
              : t("categories.listDescription")
          }
        />
        {items.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={<Tags />}
              title={t("categories.empty")}
              description={t("categories.emptyDescription")}
            />
          </CardBody>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((cat, index) => (
              <li
                key={cat.id}
                draggable
                onDragStart={(e) => {
                  setDragId(cat.id);
                  beforeDrag.current = items;
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", cat.id);
                }}
                onDragOver={(e) => {
                  if (!dragId || dragId === cat.id) return;
                  e.preventDefault();
                  const from = items.findIndex((c) => c.id === dragId);
                  if (from < 0) return;
                  const next = [...items];
                  const [moved] = next.splice(from, 1);
                  next.splice(index, 0, moved!);
                  setItems(next);
                }}
                onDrop={(e) => e.preventDefault()}
                onDragEnd={() => {
                  const previous = beforeDrag.current;
                  setDragId(null);
                  beforeDrag.current = null;
                  if (
                    previous &&
                    previous.map((c) => c.id).join() !== items.map((c) => c.id).join()
                  ) {
                    persistOrder(items, previous);
                  }
                }}
                className={cn(
                  "flex flex-wrap items-start gap-3 px-4 py-3 transition-colors sm:flex-nowrap",
                  dragId === cat.id && "bg-muted/60 opacity-70",
                )}
              >
                <span
                  className="mt-2 hidden cursor-grab text-fg-muted active:cursor-grabbing sm:block"
                  title={t("categories.dragHint")}
                  aria-hidden
                >
                  <GripVertical className="size-4" />
                </span>
                <CategoryColor
                  value={cat.color}
                  label={t("categories.colorFor", { name: cat.names[defaultLocale] ?? "" })}
                  onSave={async (color) => {
                    const res = await updateCategoryAction(wsSlug, cat.id, { color });
                    if (!res.ok) return toast.error(res.error);
                    setItems(res.data);
                    toast.success(t("saved"));
                  }}
                />
                <div className="grid min-w-0 flex-1 gap-2">
                  <div className="flex items-center gap-2">
                    <CategoryChip
                      name={cat.names[defaultLocale] ?? Object.values(cat.names)[0] ?? "—"}
                      color={cat.color}
                    />
                  </div>
                  <div className={cn("grid gap-2", locales.length > 1 && "sm:grid-cols-2")}>
                    {[{ code: defaultLocale, label: defaultLabel }, ...otherLocales].map((l) => (
                      <InlineName
                        key={l.code}
                        id={`cat-${cat.id}-${l.code}`}
                        label={l.label}
                        showLabel={locales.length > 1}
                        value={cat.names[l.code] ?? ""}
                        placeholder={
                          l.code === defaultLocale
                            ? ""
                            : t("categories.missingTranslation", {
                                name: cat.names[defaultLocale] ?? "",
                              })
                        }
                        required={l.code === defaultLocale}
                        onSave={async (name) => {
                          const res = await updateCategoryAction(wsSlug, cat.id, {
                            names: { [l.code]: name },
                          });
                          if (!res.ok) {
                            toast.error(res.error);
                            return false;
                          }
                          setItems(res.data);
                          toast.success(t("saved"));
                          return true;
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 sm:mt-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={t("categories.moveUp")}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={index === items.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={t("categories.moveDown")}
                  >
                    <ArrowDown />
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-fg-muted hover:text-danger"
                        aria-label={t("categories.delete")}
                      >
                        <Trash2 />
                      </Button>
                    }
                    title={t("categories.deleteTitle", { name: cat.names[defaultLocale] ?? "" })}
                    description={t("categories.deleteDescription")}
                    confirmLabel={t("categories.delete")}
                    onConfirm={async () => {
                      const res = await deleteCategoryAction(wsSlug, cat.id);
                      if (!res.ok) {
                        toast.error(res.error);
                        return false;
                      }
                      setItems(res.data);
                      toast.success(t("categories.deleted"));
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function CreateCategory({
  wsSlug,
  onCreated,
}: {
  wsSlug: string;
  onCreated: (list: Category[]) => void;
}) {
  const t = useTranslations("settings");
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]!);
  const { pending, errors, run } = useActionRunner();
  const nameError = Object.entries(errors).find(([k]) => k.startsWith("names"))?.[1];
  return (
    <Card>
      <CardHeader
        title={t("categories.createTitle")}
        description={t("categories.createDescription")}
      />
      <CardBody>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => createCategoryAction(wsSlug, { name: name.trim(), color }), {
              success: t("categories.created"),
              onSuccess: (list) => {
                onCreated(list);
                setName("");
                setColor(PALETTE[list.length % PALETTE.length]!);
              },
            });
          }}
        >
          <Field
            label={t("categories.name")}
            htmlFor="new-category-name"
            error={nameError}
            className="min-w-48 flex-1"
          >
            <Input
              id="new-category-name"
              value={name}
              maxLength={40}
              placeholder={t("categories.namePlaceholder")}
              aria-invalid={Boolean(nameError)}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label={t("categories.color")} htmlFor="new-category-color" className="w-36">
            <ColorInput id="new-category-color" value={color} onChange={setColor} />
          </Field>
          <Button type="submit" loading={pending} disabled={!name.trim() || !isHex(color)}>
            {pending ? null : <Plus />}
            {t("categories.add")}
          </Button>
        </form>
        <fieldset className="mt-3 flex flex-wrap gap-1.5">
          <legend className="sr-only">{t("categories.palette")}</legend>
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={c}
              aria-pressed={color.toUpperCase() === c}
              className={cn(
                "size-6 rounded-full border border-black/10 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
                color.toUpperCase() === c && "ring-2 ring-fg/40 ring-offset-2 ring-offset-surface",
              )}
              style={{ background: c }}
            />
          ))}
        </fieldset>
      </CardBody>
    </Card>
  );
}

/** Color swatch that saves (debounced) after the user stops picking. */
function CategoryColor({
  value,
  label,
  onSave,
}: {
  value: string;
  label: string;
  onSave: (color: string) => Promise<unknown>;
}) {
  const [color, setColor] = useState(value);
  const saved = useRef(value);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    setColor(value);
    saved.current = value;
  }, [value]);

  useEffect(() => {
    if (!isHex(color) || color.toUpperCase() === saved.current.toUpperCase()) return;
    const timer = setTimeout(() => {
      saved.current = color.toUpperCase();
      void onSaveRef.current(color.toUpperCase());
    }, 600);
    return () => clearTimeout(timer);
  }, [color]);

  return (
    <label
      className="relative mt-1 size-7 shrink-0 cursor-pointer overflow-hidden rounded-full border border-black/10 shadow-xs focus-within:ring-2 focus-within:ring-brand/50"
      style={{ background: color }}
      title={label}
    >
      <span className="sr-only">{label}</span>
      <input
        type="color"
        value={isHex(color) ? color : "#3778ff"}
        onChange={(e) => setColor(e.target.value.toUpperCase())}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
    </label>
  );
}

/** Text input that saves on blur / Enter and reverts on Escape. */
function InlineName({
  id,
  label,
  showLabel,
  value,
  placeholder,
  required,
  onSave,
}: {
  id: string;
  label: string;
  showLabel: boolean;
  value: string;
  placeholder?: string;
  required?: boolean;
  onSave: (name: string) => Promise<boolean>;
}) {
  const t = useTranslations("settings.categories");
  const [draft, setDraft] = useState(value);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    const name = draft.trim();
    if (name === value) return setDraft(value);
    if (!name) {
      if (required || value) setError(t("nameRequired"));
      setDraft(value);
      return;
    }
    setError(null);
    start(async () => {
      const ok = await onSave(name);
      if (!ok) setDraft(value);
    });
  };

  return (
    <div className="grid gap-1">
      <div
        className={cn(
          "flex h-8 items-center overflow-hidden rounded-md border border-transparent bg-transparent transition-colors hover:border-border focus-within:border-brand focus-within:bg-surface focus-within:ring-2 focus-within:ring-brand/30",
          error && "border-danger",
        )}
      >
        {showLabel ? (
          <label
            htmlFor={id}
            className="shrink-0 border-r border-border px-2 text-[11px] font-medium uppercase tracking-wide text-fg-muted"
          >
            {label}
          </label>
        ) : (
          <label htmlFor={id} className="sr-only">
            {label}
          </label>
        )}
        <input
          id={id}
          value={draft}
          maxLength={40}
          disabled={pending}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              setDraft(value);
              setError(null);
              e.currentTarget.blur();
            }
          }}
          className="h-full w-full min-w-0 bg-transparent px-2 text-sm text-fg outline-none placeholder:text-fg-muted/60 disabled:opacity-60"
        />
        {pending ? (
          <span
            className="mr-2 size-3.5 shrink-0 animate-spin rounded-full border-2 border-fg-muted border-r-transparent"
            aria-hidden
          />
        ) : null}
      </div>
      {error ? (
        <p className="text-[12px] text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

"use client";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";

/**
 * Confirmation dialog for destructive actions. With `confirmText`, the user has to type it
 * (e.g. the workspace name) before the confirm button is enabled.
 * `onConfirm` may return `false` to keep the dialog open (e.g. on error).
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  confirmText,
  confirmTextLabel,
  tone = "danger",
  onConfirm,
  children,
}: {
  trigger: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel: React.ReactNode;
  confirmText?: string;
  confirmTextLabel?: React.ReactNode;
  tone?: "danger" | "primary";
  // biome-ignore lint/suspicious/noConfusingVoidType: allows plain `async () => {}` callbacks
  onConfirm: () => Promise<boolean | void> | boolean | void;
  children?: React.ReactNode;
}) {
  const t = useTranslations("common");
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  const matches = !confirmText || typed.trim() === confirmText;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        setOpen(o);
        if (!o) setTyped("");
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={title} description={description}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!matches) return;
            start(async () => {
              const keepOpen = (await onConfirm()) === false;
              if (!keepOpen) {
                setOpen(false);
                setTyped("");
              }
            });
          }}
        >
          {children}
          {confirmText ? (
            <Field label={confirmTextLabel} htmlFor={inputId}>
              <Input
                id={inputId}
                autoComplete="off"
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={confirmText}
              />
            </Field>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              variant={tone === "danger" ? "danger" : "primary"}
              loading={pending}
              disabled={!matches}
            >
              {confirmLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

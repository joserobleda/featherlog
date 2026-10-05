"use client";
import { ImageUp, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Square image picker (logo / avatar). POSTs `multipart/form-data` (`file`) to `endpoint`,
 * which answers `{ url }` or `{ error: "type" | "size" | "invalid" | "missing" | "forbidden" }`;
 * DELETE on the same endpoint removes the image.
 */
export function ImageUpload({
  endpoint,
  value,
  name,
  shape = "rounded",
  label,
  disabled,
}: {
  endpoint: string;
  value: string | null;
  /** Used for the initials fallback. */
  name: string;
  shape?: "rounded" | "circle";
  label: string;
  disabled?: boolean;
}) {
  const t = useTranslations("settings.upload");
  const router = useRouter();
  const inputId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(value);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);

  const errorMessage = (code: string | undefined) => {
    switch (code) {
      case "type":
        return t("errorType");
      case "size":
        return t("errorSize");
      case "invalid":
        return t("errorInvalid");
      case "forbidden":
        return t("errorForbidden");
      default:
        return t("errorGeneric");
    }
  };

  function upload(file: File) {
    if (!ACCEPT.includes(file.type)) return toast.error(t("errorType"));
    if (file.size > MAX_BYTES) return toast.error(t("errorSize"));
    setBusy("upload");
    start(async () => {
      const fd = new FormData();
      fd.append("file", file);
      try {
        const res = await fetch(endpoint, { method: "POST", body: fd });
        const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!res.ok || !body.url) {
          toast.error(errorMessage(body.error));
          return;
        }
        setPreview(body.url);
        toast.success(t("uploaded"));
        router.refresh();
      } catch {
        toast.error(t("errorGeneric"));
      } finally {
        setBusy(null);
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  function remove() {
    setBusy("remove");
    start(async () => {
      try {
        const res = await fetch(endpoint, { method: "DELETE" });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(errorMessage(body.error));
          return;
        }
        setPreview(null);
        toast.success(t("removed"));
        router.refresh();
      } catch {
        toast.error(t("errorGeneric"));
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar
        name={name}
        image={preview}
        size={64}
        className={cn("border border-border", shape === "rounded" ? "rounded-xl" : "rounded-full")}
      />
      <div className="grid gap-2">
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPT.join(",")}
            className="sr-only"
            aria-describedby={hintId}
            disabled={disabled || pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={busy === "upload"}
            disabled={disabled || pending}
            onClick={() => inputRef.current?.click()}
          >
            {busy === "upload" ? null : <ImageUp />}
            <span className="sr-only">{label}:</span>
            {preview ? t("replace") : t("upload")}
          </Button>
          {preview ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              loading={busy === "remove"}
              disabled={disabled || pending}
              onClick={remove}
            >
              {busy === "remove" ? null : <Trash2 />}
              {t("remove")}
            </Button>
          ) : null}
        </div>
        <p id={hintId} className="text-[13px] text-fg-muted">
          {t("hint")}
        </p>
      </div>
    </div>
  );
}

"use client";
import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function useCopy() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);
  return {
    copied,
    copy: async (value: string) => {
      try {
        await navigator.clipboard.writeText(value);
        setCopied(true);
      } catch {
        setCopied(false);
      }
    },
  };
}

/** Read-only single-line value with a copy button. */
export function CopyField({
  value,
  id,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  id?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const t = useTranslations("common");
  const { copied, copy } = useCopy();
  return (
    <div
      className={cn(
        "flex h-9 items-center overflow-hidden rounded-lg border border-border bg-muted/40 shadow-xs",
        className,
      )}
    >
      <input
        id={id}
        readOnly
        value={value}
        aria-label={ariaLabel}
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 bg-transparent px-3 font-mono text-[13px] text-fg outline-none"
      />
      <button
        type="button"
        onClick={() => copy(value)}
        className="flex h-full items-center gap-1.5 border-l border-border bg-surface px-3 text-[13px] font-medium text-fg-muted transition-colors hover:bg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/50"
      >
        {copied ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
        <span aria-live="polite">{copied ? t("copied") : t("copy")}</span>
      </button>
    </div>
  );
}

/** Multi-line code snippet with a copy button. */
export function CodeBlock({
  code,
  className,
  label,
}: {
  code: string;
  className?: string;
  label?: string;
}) {
  const t = useTranslations("common");
  const { copied, copy } = useCopy();
  return (
    <div className={cn("relative rounded-lg border border-border bg-muted/50", className)}>
      {label ? (
        <div className="border-b border-border px-3 py-1.5 text-xs font-medium text-fg-muted">
          {label}
        </div>
      ) : null}
      <pre className="overflow-x-auto px-3 py-3 pr-24 font-mono text-[12.5px] leading-relaxed text-fg">
        <code>{code}</code>
      </pre>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => copy(code)}
        className={cn("absolute right-2", label ? "top-10" : "top-2")}
      >
        {copied ? <Check className="text-green-600" /> : <Copy />}
        <span aria-live="polite">{copied ? t("copied") : t("copy")}</span>
      </Button>
    </div>
  );
}

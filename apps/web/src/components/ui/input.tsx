import type * as React from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg shadow-xs placeholder:text-fg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:border-brand disabled:opacity-60 aria-invalid:border-danger";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(base, "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(base, "min-h-20 py-2", className)} {...props} />;
}

export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        base,
        "h-9 pr-8 appearance-none bg-[length:16px] bg-[right_8px_center] bg-no-repeat",
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23667085' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  // biome-ignore lint/a11y/noLabelWithoutControl: htmlFor is passed by callers
  return <label className={cn("text-sm font-medium text-fg", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label?: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      {label ? <Label htmlFor={htmlFor}>{label}</Label> : null}
      {children}
      {error ? (
        <p className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-fg-muted">{hint}</p>
      ) : null}
    </div>
  );
}

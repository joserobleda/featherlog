"use client";
import { cn } from "@/lib/utils";

export function ColorInput({
  value,
  onChange,
  id,
  name,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  name?: string;
  className?: string;
}) {
  const valid = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <div
      className={cn(
        "flex h-9 items-center gap-2 rounded-lg border border-border bg-surface pl-1.5 pr-3",
        className,
      )}
    >
      <input
        type="color"
        aria-label="Pick a color"
        value={valid ? value : "#3778ff"}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
      />
      <input
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        className="w-full bg-transparent font-mono text-sm uppercase outline-none"
        maxLength={7}
        aria-invalid={!valid}
      />
    </div>
  );
}

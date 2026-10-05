import type * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-muted text-fg-muted",
  brand: "bg-brand/10 text-brand",
  success: "bg-green-500/10 text-green-700 dark:text-green-400",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  danger: "bg-red-500/10 text-red-700 dark:text-red-400",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}

export function CategoryChip({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span className={cn("fl-category", className)} style={{ ["--fl-cat" as string]: color, ["--fl-cat-fg" as string]: textOn(color) }}>
      {name}
    </span>
  );
}

/** Black or white text depending on the background luminance. */
export function textOn(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = Number.parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return lum > 0.45 ? "#000000" : "#ffffff";
}

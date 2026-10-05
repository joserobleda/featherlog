import { cn, initials } from "@/lib/utils";

export function Avatar({ name, image, size = 28, className }: { name: string; image?: string | null; size?: number; className?: string }) {
  return image ? (
    // biome-ignore lint/performance/noImgElement: user-provided avatar URLs
    <img src={image} alt="" width={size} height={size} className={cn("rounded-full object-cover", className)} style={{ width: size, height: size }} />
  ) : (
    <span
      className={cn("inline-flex items-center justify-center rounded-full bg-brand/15 font-semibold text-brand", className)}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {initials(name) || "?"}
    </span>
  );
}

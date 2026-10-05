"use client";
import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Input, Select } from "@/components/ui/input";

export function PostFilters({
  locales,
  multiLocale,
}: {
  locales: { code: string; name: string }[];
  multiLocale: boolean;
}) {
  const t = useTranslations("posts");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    next.delete("cursor");
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const s = next.toString();
    router.replace(s ? `${pathname}?${s}` : pathname);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: debounce only on the search text
  useEffect(() => {
    const id = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) update({ q });
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  const langValue = params.get("missing")
    ? `missing:${params.get("missing")}`
    : (params.get("locale") ?? "");

  return (
    <div className="flex items-center gap-2">
      {multiLocale ? (
        <Select
          aria-label={t("allLanguages")}
          value={langValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v.startsWith("missing:")) update({ missing: v.slice(8), locale: "" });
            else update({ locale: v, missing: "" });
          }}
          className="w-44"
        >
          <option value="">{t("allLanguages")}</option>
          {locales.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
          {locales.map((l) => (
            <option key={`m-${l.code}`} value={`missing:${l.code}`}>
              {t("missingIn", { language: l.name })}
            </option>
          ))}
        </Select>
      ) : null}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-56 pl-8"
        />
      </div>
    </div>
  );
}

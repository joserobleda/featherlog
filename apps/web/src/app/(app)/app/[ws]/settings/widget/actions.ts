"use server";
import { updateWidgetSettings, WIDGET_STRING_KEYS } from "@featherlog/core";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { getWorkspaceContext } from "@/lib/session";

export type WidgetFormInput = {
  accentColor: string | null;
  badgeDelay: number;
  entriesLimit: number;
  expireAfterDays: number | null;
  softHide: boolean;
  eyecatcher: "off" | "on" | "progressive";
  metaPosition: "above" | "below";
  stickyFooter: boolean;
  uiStrings: Record<string, Record<string, string>>;
};

export async function updateWidgetAction(wsSlug: string, input: WidgetFormInput) {
  const { ctx, workspace } = await getWorkspaceContext(wsSlug);
  return runAction(async () => {
    // Only keep non-empty overrides for known keys and enabled locales.
    const uiStrings: Record<
      string,
      Partial<Record<(typeof WIDGET_STRING_KEYS)[number], string>>
    > = {};
    for (const [locale, strings] of Object.entries(input.uiStrings ?? {})) {
      if (!workspace.locales.includes(locale)) continue;
      const clean: Partial<Record<(typeof WIDGET_STRING_KEYS)[number], string>> = {};
      for (const key of WIDGET_STRING_KEYS) {
        const v = strings?.[key]?.trim();
        if (v) clean[key] = v;
      }
      if (Object.keys(clean).length) uiStrings[locale] = clean;
    }
    await updateWidgetSettings(ctx, {
      accentColor: input.accentColor ? input.accentColor.toUpperCase() : null,
      badgeDelay: input.badgeDelay,
      entriesLimit: input.entriesLimit,
      expireAfterDays: input.expireAfterDays,
      softHide: input.softHide,
      eyecatcher: input.eyecatcher,
      metaPosition: input.metaPosition,
      stickyFooter: input.stickyFooter,
      uiStrings,
    });
    revalidatePath(`/app/${workspace.slug}/settings/widget`);
  });
}

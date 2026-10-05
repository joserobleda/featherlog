"use server";
import { updateWorkspace } from "@featherlog/core";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { getWorkspaceContext } from "@/lib/session";

export async function updateLanguagesAction(
  wsSlug: string,
  input: { defaultLocale: string; locales: string[]; missingTranslation: "fallback" | "hide" },
) {
  const { ctx, workspace } = await getWorkspaceContext(wsSlug);
  return runAction(async () => {
    const ws = await updateWorkspace(ctx, {
      defaultLocale: input.defaultLocale,
      locales: input.locales,
      missingTranslation: input.missingTranslation,
    });
    revalidatePath(`/app/${workspace.slug}`, "layout");
    return { defaultLocale: ws.defaultLocale, locales: ws.locales };
  });
}

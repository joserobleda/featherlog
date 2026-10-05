"use server";
import { updateWorkspace } from "@featherlog/core";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { getWorkspaceContext } from "@/lib/session";

export async function updatePublicPageAction(
  wsSlug: string,
  input: {
    accentColor: string;
    showAuthors: boolean;
    noindex: boolean;
    privateMode: boolean;
    whitelabel: boolean;
  },
) {
  const { ctx, workspace } = await getWorkspaceContext(wsSlug);
  return runAction(async () => {
    await updateWorkspace(ctx, {
      accentColor: input.accentColor.toUpperCase(),
      showAuthors: input.showAuthors,
      noindex: input.noindex,
      privateMode: input.privateMode,
      whitelabel: input.whitelabel,
    });
    revalidatePath(`/app/${workspace.slug}/settings/public-page`);
  });
}

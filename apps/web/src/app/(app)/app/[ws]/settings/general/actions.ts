"use server";
import { AppError, deleteWorkspace, type Terminology, updateWorkspace } from "@featherlog/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction } from "@/lib/actions";
import { getWorkspaceContext } from "@/lib/session";

export async function updateGeneralAction(
  wsSlug: string,
  input: { name: string; slug: string; terminology: Terminology; websiteUrl: string },
) {
  const { ctx, workspace } = await getWorkspaceContext(wsSlug);
  return runAction(async () => {
    const ws = await updateWorkspace(ctx, {
      name: input.name,
      slug: input.slug.trim().toLowerCase(),
      terminology: input.terminology,
      websiteUrl: input.websiteUrl.trim(),
    });
    // When the slug changes the client navigates to the new URL itself.
    if (ws.slug === workspace.slug) revalidatePath(`/app/${ws.slug}`, "layout");
    return { slug: ws.slug };
  });
}

export async function deleteWorkspaceAction(wsSlug: string, confirmName: string) {
  const { ctx, workspace } = await getWorkspaceContext(wsSlug);
  const res = await runAction(async () => {
    if (confirmName.trim() !== workspace.name) {
      throw new AppError("validation", "The name doesn't match", { field: "confirm" });
    }
    await deleteWorkspace(ctx);
  });
  if (res.ok) redirect("/app");
  return res;
}

"use server";
import {
  createCategory,
  deleteCategory,
  listCategories,
  reorderCategories,
  rerenderWorkspacePosts,
  updateCategory,
} from "@featherlog/core";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/session";

const path = (slug: string) => `/app/${slug}/settings/categories`;

export async function createCategoryAction(wsSlug: string, input: { name: string; color: string }) {
  const { ctx, workspace } = await getWorkspaceContext(wsSlug);
  return runAction(async () => {
    await createCategory(ctx, {
      color: input.color,
      names: { [workspace.defaultLocale]: input.name },
    });
    revalidatePath(path(workspace.slug));
    return listCategories(db, workspace.id);
  });
}

export async function updateCategoryAction(
  wsSlug: string,
  id: string,
  input: { color?: string; names?: Record<string, string> },
) {
  const { ctx, workspace } = await getWorkspaceContext(wsSlug);
  return runAction(async () => {
    await updateCategory(ctx, id, input);
    // Stored post HTML embeds category labels/colors.
    await rerenderWorkspacePosts(db, workspace.id);
    revalidatePath(path(workspace.slug));
    return listCategories(db, workspace.id);
  });
}

export async function reorderCategoriesAction(wsSlug: string, orderedIds: string[]) {
  const { ctx, workspace } = await getWorkspaceContext(wsSlug);
  return runAction(async () => {
    const list = await reorderCategories(ctx, orderedIds);
    revalidatePath(path(workspace.slug));
    return list;
  });
}

export async function deleteCategoryAction(wsSlug: string, id: string) {
  const { ctx, workspace } = await getWorkspaceContext(wsSlug);
  return runAction(async () => {
    await deleteCategory(ctx, id);
    await rerenderWorkspacePosts(db, workspace.id);
    revalidatePath(path(workspace.slug));
    return listCategories(db, workspace.id);
  });
}

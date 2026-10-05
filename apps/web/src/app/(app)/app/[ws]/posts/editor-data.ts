import "server-only";
import { can, listCategories, listMembers, localeInfo } from "@featherlog/core";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import type { WorkspaceContext } from "@/lib/session";
import type { EditorProps } from "./post-editor";

/** Shared props for the new/edit post pages. */
export async function editorBase({ workspace, ctx }: WorkspaceContext) {
  const [categories, members] = await Promise.all([listCategories(db, workspace.id), listMembers(db, workspace.id)]);
  return {
    workspace: {
      slug: workspace.slug,
      name: workspace.name,
      logoUrl: workspace.logoUrl,
      accentColor: workspace.accentColor,
      defaultLocale: workspace.defaultLocale,
      locales: workspace.locales.map((code) => ({
        code,
        name: localeInfo(code)?.nativeName ?? code,
        dir: localeInfo(code)?.dir ?? "ltr",
      })),
      publicBase: env.PUBLIC_URL,
    },
    categories: categories.map((c) => ({ id: c.id, color: c.color, names: c.names })),
    members: members.map((m) => ({ id: m.userId, name: m.displayName || m.name, image: m.image })),
    canPublish: can(ctx.actor, "posts:publish"),
  } satisfies Omit<EditorProps, "initial">;
}

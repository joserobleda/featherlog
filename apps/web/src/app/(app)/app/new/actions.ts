"use server";
import { createWorkspace } from "@featherlog/core";
import { runAction } from "@/lib/actions";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

export async function createWorkspaceAction(input: {
  name: string;
  slug?: string;
  defaultLocale: string;
  websiteUrl?: string;
}) {
  const session = await requireSession();
  return runAction(async () => {
    const ws = await createWorkspace(db, session.user.id, {
      name: input.name,
      slug: input.slug || undefined,
      defaultLocale: input.defaultLocale,
      websiteUrl: input.websiteUrl || undefined,
    });
    return { slug: ws.slug };
  });
}

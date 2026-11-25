import "server-only";
import { can } from "@featherlog/core";
import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/session";

/** Newsletters are for owners and admins; editors go back to posts. */
export async function getNewsletterContext(slug: string) {
  const wc = await getWorkspaceContext(slug);
  if (!can(wc.ctx.actor, "newsletters:read")) redirect(`/app/${wc.workspace.slug}/posts`);
  return wc;
}

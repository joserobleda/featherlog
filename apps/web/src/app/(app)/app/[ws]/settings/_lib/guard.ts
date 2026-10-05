import "server-only";
import { can } from "@featherlog/core";
import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/session";

/** Workspace context for admin-only settings pages; editors are sent to the (read-only) team page. */
export async function getSettingsContext(slug: string) {
  const wc = await getWorkspaceContext(slug);
  if (!can(wc.ctx.actor, "settings:write")) redirect(`/app/${wc.workspace.slug}/settings/team`);
  return wc;
}

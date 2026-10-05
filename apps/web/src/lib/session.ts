import "server-only";
import {
  type Ctx,
  getMembershipRole,
  listUserWorkspaces,
  type Role,
  type Workspace,
  findWorkspaceBySlug,
} from "@featherlog/core";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";
import { db } from "./db";

export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export async function requireSession(next?: string) {
  const session = await getSession();
  if (!session) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return session;
}

export type WorkspaceContext = {
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>;
  workspace: Workspace;
  role: Role;
  ctx: Ctx;
  workspaces: Awaited<ReturnType<typeof listUserWorkspaces>>;
};

/** Resolves the current user's membership in the workspace identified by its slug (panel routes). */
export const getWorkspaceContext = cache(async (slug: string): Promise<WorkspaceContext> => {
  const session = await requireSession(`/app/${slug}`);
  const found = await findWorkspaceBySlug(db, slug);
  if (!found) notFound();
  if (found.redirectedFrom) redirect(`/app/${found.workspace.slug}`);
  const role = await getMembershipRole(db, found.workspace.id, session.user.id);
  if (!role) notFound();
  const workspaces = await listUserWorkspaces(db, session.user.id);
  return {
    session,
    workspace: found.workspace,
    role,
    workspaces,
    ctx: { db, workspaceId: found.workspace.id, actor: { kind: "user", userId: session.user.id, role }, via: "panel" },
  };
});

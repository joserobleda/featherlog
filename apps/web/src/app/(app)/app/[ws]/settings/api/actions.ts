"use server";
import {
  createApiKey,
  revokeApiKey,
  revokeAuthorizedApp,
  type Scope,
  updateWorkspace,
} from "@featherlog/core";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/session";

export async function createApiKeyAction(
  ws: string,
  input: { name: string; scopes: Scope[]; expiresInDays: number | null },
) {
  const { ctx, workspace } = await getWorkspaceContext(ws);
  return runAction(async () => {
    const { key, secret } = await createApiKey(ctx, {
      name: input.name,
      scopes: input.scopes,
      expiresAt: input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 86_400_000)
        : null,
    });
    revalidatePath(`/app/${workspace.slug}/settings/api`);
    return { id: key.id, secret };
  });
}

export async function revokeApiKeyAction(ws: string, id: string) {
  const { ctx, workspace } = await getWorkspaceContext(ws);
  return runAction(async () => {
    await revokeApiKey(ctx, id);
    revalidatePath(`/app/${workspace.slug}/settings/api`);
  });
}

export async function setIntegrationsCanPublishAction(ws: string, value: boolean) {
  const { ctx, workspace } = await getWorkspaceContext(ws);
  return runAction(async () => {
    await updateWorkspace(ctx, { integrationsCanPublish: value });
    revalidatePath(`/app/${workspace.slug}/settings/api`);
  });
}

export async function revokeAppAction(ws: string, clientId: string) {
  const { session, workspace } = await getWorkspaceContext(ws);
  return runAction(async () => {
    await revokeAuthorizedApp(db, session.user.id, clientId);
    revalidatePath(`/app/${workspace.slug}/settings/api`);
  });
}

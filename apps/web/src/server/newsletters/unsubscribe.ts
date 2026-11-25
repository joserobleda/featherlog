import { findWorkspaceByPublicId, type Subscriber, unsubscribeById } from "@featherlog/core";
import { subscribers } from "@featherlog/db";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe-tokens";

/** Resolves an unsubscribe link to its workspace and subscriber, or null if it is not valid. */
export async function resolveUnsubscribeLink(account: string, token: string) {
  const ws = await findWorkspaceByPublicId(db, account).catch(() => null);
  if (!ws) return null;
  const subscriberId = verifyUnsubscribeToken(ws.id, token);
  if (!subscriberId) return null;
  const [subscriber] = await db
    .select()
    .from(subscribers)
    .where(and(eq(subscribers.id, subscriberId), eq(subscribers.workspaceId, ws.id)));
  return subscriber ? { workspace: ws, subscriber: subscriber as Subscriber } : null;
}

export async function unsubscribeLink(account: string, token: string) {
  const found = await resolveUnsubscribeLink(account, token);
  if (!found) return null;
  await unsubscribeById(db, found.workspace.id, found.subscriber.id);
  return found;
}

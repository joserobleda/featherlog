import { type DbOrTx, events } from "@featherlog/db";

export type DomainEvent =
  | "post.created"
  | "post.updated"
  | "post.published"
  | "post.unpublished"
  | "post.deleted"
  | "workspace.updated";

/** Appends an event to the outbox, in the caller's transaction. */
export async function emit(db: DbOrTx, workspaceId: string, type: DomainEvent, payload: Record<string, unknown>) {
  await db.insert(events).values({ workspaceId, type, payload });
}

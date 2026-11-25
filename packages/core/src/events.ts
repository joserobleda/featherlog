import { type DbOrTx, events } from "@featherlog/db";

export type DomainEvent =
  | "post.created"
  | "post.updated"
  | "post.published"
  | "post.unpublished"
  | "post.deleted"
  | "post.review_requested"
  | "post.review_withdrawn"
  | "workspace.updated"
  | "subscriber.unsubscribed"
  | "subscriber.bounced"
  | "newsletter.created"
  | "newsletter.deleted"
  | "newsletter.sending"
  | "newsletter.sent";

/** Appends an event to the outbox, in the caller's transaction. */
export async function emit(
  db: DbOrTx,
  workspaceId: string,
  type: DomainEvent,
  payload: Record<string, unknown>,
) {
  await db.insert(events).values({ workspaceId, type, payload });
}

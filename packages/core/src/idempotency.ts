import { type DbOrTx, idempotencyKeys } from "@featherlog/db";
import { and, eq, lt } from "drizzle-orm";
import { sha256 } from "./crypto";
import { AppError } from "./errors";

export type StoredResponse = { status: number; body: unknown };

/**
 * Runs `fn` at most once per (principal, key). Replays return the stored response.
 * Reusing a key with a different request body is rejected.
 */
export async function withIdempotency(
  db: DbOrTx,
  principal: string,
  key: string,
  requestBody: string,
  fn: () => Promise<StoredResponse>,
): Promise<StoredResponse & { replayed: boolean }> {
  const requestHash = sha256(requestBody);
  const [existing] = await db
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.principal, principal), eq(idempotencyKeys.key, key)));
  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new AppError(
        "validation",
        "This Idempotency-Key was already used with a different request",
      );
    }
    return { status: existing.status, body: existing.response, replayed: true };
  }
  const result = await fn();
  if (result.status < 500) {
    await db
      .insert(idempotencyKeys)
      .values({
        principal,
        key,
        requestHash,
        status: result.status,
        response: result.body as object,
      })
      .onConflictDoNothing();
  }
  return { ...result, replayed: false };
}

export async function purgeIdempotencyKeys(db: DbOrTx, olderThanHours = 24) {
  await db
    .delete(idempotencyKeys)
    .where(lt(idempotencyKeys.createdAt, new Date(Date.now() - olderThanHours * 3_600_000)));
}

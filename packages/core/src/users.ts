import { account, type Db, type DbOrTx, session, user } from "@featherlog/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { notFound } from "./errors";
import { newId } from "./ids";

export const UpdateProfileInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    displayName: z.string().trim().max(80).nullable(),
    jobTitle: z.string().trim().max(80).nullable(),
    image: z.string().max(2048).nullable(),
    uiLocale: z.enum(["en", "es"]).nullable(),
  })
  .partial();

export async function getUser(db: DbOrTx, id: string) {
  const [u] = await db.select().from(user).where(eq(user.id, id));
  if (!u) throw notFound("User");
  return u;
}

export async function updateProfile(
  db: DbOrTx,
  userId: string,
  raw: z.input<typeof UpdateProfileInput>,
) {
  const input = UpdateProfileInput.parse(raw);
  const [u] = await db
    .update(user)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(user.id, userId))
    .returning();
  return u!;
}

/**
 * Replaces a user's password (operator recovery when email isn't available) and signs them out
 * everywhere. Users without a password login (Google, magic link) get one. `passwordHash` must
 * come from better-auth's `hashPassword`, so the app can verify it.
 */
export async function setUserPassword(db: Db, email: string, passwordHash: string) {
  const [u] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email.trim().toLowerCase()));
  if (!u) throw notFound("User");
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(account)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(and(eq(account.userId, u.id), eq(account.providerId, "credential")))
      .returning({ id: account.id });
    if (updated.length === 0) {
      await tx.insert(account).values({
        id: newId(),
        accountId: u.id,
        providerId: "credential",
        userId: u.id,
        password: passwordHash,
      });
    }
    await tx.delete(session).where(eq(session.userId, u.id));
  });
}

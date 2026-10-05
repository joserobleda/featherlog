import { type DbOrTx, user } from "@featherlog/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { notFound } from "./errors";

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

export async function updateProfile(db: DbOrTx, userId: string, raw: z.input<typeof UpdateProfileInput>) {
  const input = UpdateProfileInput.parse(raw);
  const [u] = await db
    .update(user)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(user.id, userId))
    .returning();
  return u!;
}

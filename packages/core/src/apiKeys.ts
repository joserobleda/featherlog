import { apiKeys, type DbOrTx } from "@featherlog/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { type Actor, assertCan, type Ctx, SCOPES, type Scope } from "./auth";
import { randomToken, sha256 } from "./crypto";
import { newId } from "./ids";

export const KEY_PREFIX = "fl_live_";

export const CreateApiKeyInput = z.object({
  name: z.string().trim().min(1).max(60),
  scopes: z.array(z.enum(SCOPES)).min(1),
  expiresAt: z.coerce.date().nullable().optional(),
});

export async function createApiKey(ctx: Ctx, raw: z.input<typeof CreateApiKeyInput>) {
  assertCan(ctx, "settings:write");
  const input = CreateApiKeyInput.parse(raw);
  const secret = `${KEY_PREFIX}${randomToken(36)}`;
  const [row] = await ctx.db
    .insert(apiKeys)
    .values({
      id: newId(),
      workspaceId: ctx.workspaceId,
      name: input.name,
      prefix: secret.slice(0, KEY_PREFIX.length + 6),
      hash: sha256(secret),
      scopes: [...new Set(input.scopes)],
      expiresAt: input.expiresAt ?? null,
      createdBy: ctx.actor.kind === "user" ? ctx.actor.userId : null,
    })
    .returning();
  // The plaintext secret is returned exactly once.
  return { key: publicKey(row!), secret };
}

function publicKey(k: typeof apiKeys.$inferSelect) {
  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    scopes: k.scopes as Scope[],
    lastUsedAt: k.lastUsedAt,
    expiresAt: k.expiresAt,
    createdAt: k.createdAt,
  };
}

export async function listApiKeys(ctx: Ctx) {
  assertCan(ctx, "settings:write");
  const rows = await ctx.db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.workspaceId, ctx.workspaceId), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt));
  return rows.map(publicKey);
}

export async function revokeApiKey(ctx: Ctx, id: string) {
  assertCan(ctx, "settings:write");
  await ctx.db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.workspaceId, ctx.workspaceId)));
}

/** Resolves a plaintext API key to its workspace and actor, or null if invalid/revoked/expired. */
export async function verifyApiKey(
  db: DbOrTx,
  secret: string,
): Promise<{ workspaceId: string; actor: Actor; apiKeyId: string } | null> {
  if (!secret.startsWith(KEY_PREFIX)) return null;
  const [k] = await db.select().from(apiKeys).where(eq(apiKeys.hash, sha256(secret)));
  if (!k || k.revokedAt || (k.expiresAt && k.expiresAt.getTime() < Date.now())) return null;
  if (!k.lastUsedAt || Date.now() - k.lastUsedAt.getTime() > 60_000) {
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, k.id));
  }
  return {
    workspaceId: k.workspaceId,
    apiKeyId: k.id,
    actor: { kind: "api_key", apiKeyId: k.id, scopes: k.scopes as Scope[], label: k.name },
  };
}

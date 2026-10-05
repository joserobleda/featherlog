import { type Db, user } from "@featherlog/db";
import { createTestDb } from "@featherlog/db/testing";
import type { Actor, Ctx, Role, Via } from "../src/auth";
import { newId } from "../src/ids";
import { createWorkspace } from "../src/workspaces";

export async function setup() {
  const { db, close } = await createTestDb();
  return { db, close };
}

export async function createUser(db: Db, name = "Ada", email?: string) {
  const id = newId();
  await db
    .insert(user)
    .values({ id, name, email: email ?? `${id}@example.com`, emailVerified: true });
  return id;
}

export async function workspaceFixture(db: Db, opts: { locales?: string[] } = {}) {
  const ownerId = await createUser(db, "Owner");
  let ws = await createWorkspace(db, ownerId, { name: "Acme Inc", defaultLocale: "en" });
  const ctx = (actor: Actor, via: Via = "panel"): Ctx => ({ db, workspaceId: ws.id, actor, via });
  const userCtx = (userId: string, role: Role, via: Via = "panel") =>
    ctx({ kind: "user", userId, role }, via);
  const owner = userCtx(ownerId, "owner");
  if (opts.locales) {
    const { updateWorkspace } = await import("../src/workspaces");
    ws = await updateWorkspace(owner, { locales: opts.locales });
  }
  return { ws, ownerId, owner, ctx, userCtx };
}

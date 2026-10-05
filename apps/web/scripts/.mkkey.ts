import { createApiKey, findWorkspaceBySlug, updateWorkspace } from "@featherlog/core";
import { createDb } from "@featherlog/db";

const { db, close } = createDb("postgres://featherlog:featherlog@localhost:5442/featherlog");
const ws = (await findWorkspaceBySlug(db, "acme-demo"))!.workspace;
const ctx = {
  db,
  workspaceId: ws.id,
  actor: { kind: "user" as const, userId: "x", role: "owner" as const },
  via: "panel" as const,
};
const { secret } = await createApiKey(ctx, {
  name: "curl test",
  scopes: [
    "posts:read",
    "posts:write",
    "posts:publish",
    "categories:write",
    "assets:write",
    "settings:write",
  ],
});
console.log(secret);
await close();

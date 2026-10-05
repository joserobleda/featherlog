// Creates a workspace API key from the command line (handy for self-hosting and CI).
//   pnpm --filter @featherlog/web exec tsx scripts/create-api-key.ts <workspace-slug> [name] [scopes,comma,separated]
import {
  createApiKey,
  findWorkspaceBySlug,
  listMembers,
  SCOPES,
  type Scope,
} from "@featherlog/core";
import { createDb } from "@featherlog/db";

const [slug, name = "CLI key", scopesArg] = process.argv.slice(2);
if (!slug) {
  console.error("Usage: create-api-key.ts <workspace-slug> [name] [scopes]");
  process.exit(1);
}
const { db, close } = createDb(
  process.env.DATABASE_URL ?? "postgres://featherlog:featherlog@localhost:5442/featherlog",
);
try {
  const found = await findWorkspaceBySlug(db, slug);
  if (!found) throw new Error(`Workspace "${slug}" not found`);
  const owner = (await listMembers(db, found.workspace.id)).find((m) => m.role === "owner");
  if (!owner) throw new Error("Workspace has no owner");
  const scopes = (
    scopesArg ? scopesArg.split(",") : SCOPES.filter((s) => s !== "members:admin")
  ) as Scope[];
  const { secret } = await createApiKey(
    {
      db,
      workspaceId: found.workspace.id,
      actor: { kind: "user", userId: owner.userId, role: "owner" },
      via: "panel",
    },
    { name, scopes },
  );
  console.log(secret);
} finally {
  await close();
}

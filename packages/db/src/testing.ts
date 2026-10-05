import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "./index";
import * as schema from "./schema";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

/** In-memory Postgres (PGlite) with all migrations applied. For fast tests. */
export async function createTestDb() {
  const client = new PGlite();
  const pdb = drizzle(client, { schema, casing: "snake_case" });
  await migrate(pdb, { migrationsFolder });
  return { db: pdb as unknown as Db, close: () => client.close() };
}

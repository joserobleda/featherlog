import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../drizzle", import.meta.url));

/** Applies pending migrations. Safe to run concurrently: guarded by an advisory lock. */
export async function runMigrations(url: string, migrationsFolder = MIGRATIONS_DIR) {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await client`select pg_advisory_lock(727274)`;
    await migrate(drizzle(client), { migrationsFolder });
    await client`select pg_advisory_unlock(727274)`;
  } finally {
    await client.end({ timeout: 5 });
  }
}

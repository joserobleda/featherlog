import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Db } from "./index";
import { runMigrations } from "./migrate";
import * as schema from "./schema";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

/**
 * Database for tests, with all migrations applied.
 * - Default: in-memory Postgres (PGlite) — fast, no services needed.
 * - With `TEST_DATABASE_URL` (e.g. in CI): a throwaway database on a real server, dropped on close,
 *   so driver-specific behaviour (postgres-js) is covered too.
 */
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const adminUrl = process.env.TEST_DATABASE_URL;
  if (adminUrl) {
    const name = `featherlog_test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
    await admin.unsafe(`create database "${name}"`);
    const url = new URL(adminUrl);
    url.pathname = `/${name}`;
    await runMigrations(url.toString(), migrationsFolder);
    const client = postgres(url.toString(), { max: 5, onnotice: () => {} });
    const db = drizzlePg(client, { schema, casing: "snake_case" }) as unknown as Db;
    return {
      db,
      close: async () => {
        await client.end({ timeout: 5 });
        await admin.unsafe(`drop database if exists "${name}" with (force)`);
        await admin.end({ timeout: 5 });
      },
    };
  }
  const client = new PGlite();
  const pdb = drizzlePglite(client, { schema, casing: "snake_case" });
  await migratePglite(pdb, { migrationsFolder });
  return { db: pdb as unknown as Db, close: () => client.close() };
}

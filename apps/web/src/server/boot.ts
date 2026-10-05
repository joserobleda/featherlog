import path from "node:path";
import { runMigrations } from "@featherlog/db/migrate";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { startWorker } from "./jobs";

/** `MIGRATIONS_DIR` in production images; the monorepo package folder in development. */
function migrationsDir() {
  return process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), "../../packages/db/drizzle");
}

const g = globalThis as unknown as { __featherlogBooted?: boolean };

/** Runs once per server process: migrations (optional) and the inline job worker. */
export async function boot() {
  if (g.__featherlogBooted) return;
  g.__featherlogBooted = true;
  if (env.MIGRATE_ON_START) {
    logger.info("applying database migrations");
    await runMigrations(env.DATABASE_URL, migrationsDir());
  }
  if (env.WORKER_MODE === "inline") {
    await startWorker().catch((err) => logger.error({ err }, "failed to start inline worker"));
  }
}

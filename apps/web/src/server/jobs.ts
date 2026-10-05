import { purgeIdempotencyKeys } from "@featherlog/core";
import { PgBoss } from "pg-boss";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const g = globalThis as unknown as { __featherlogBoss?: PgBoss };

export const JOBS = {
  purgeIdempotency: "maintenance.purge-idempotency",
} as const;

/** Starts pg-boss and registers job handlers + schedules. */
export async function startWorker() {
  if (g.__featherlogBoss) return g.__featherlogBoss;
  const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: "pgboss" });
  boss.on("error", (err) => logger.error({ err }, "pg-boss error"));
  await boss.start();
  await boss.createQueue(JOBS.purgeIdempotency);
  await boss.work(JOBS.purgeIdempotency, async () => {
    await purgeIdempotencyKeys(db);
  });
  await boss.schedule(JOBS.purgeIdempotency, "17 3 * * *");
  g.__featherlogBoss = boss;
  logger.info("job worker started");
  return boss;
}

import {
  generatingNewsletterIds,
  purgeIdempotencyKeys,
  sendingNewsletterIds,
} from "@featherlog/core";
import { PgBoss } from "pg-boss";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { generateNewsletter, sendNewsletterBatch } from "./newsletters/run";

const g = globalThis as unknown as { __featherlogBoss?: PgBoss; __featherlogBossClient?: PgBoss };

export const JOBS = {
  purgeIdempotency: "maintenance.purge-idempotency",
  newsletterGenerate: "newsletter.generate",
  newsletterSend: "newsletter.send",
} as const;

type NewsletterJob = { workspaceId: string; newsletterId: string };

function newBoss() {
  const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: "pgboss" });
  boss.on("error", (err) => logger.error({ err }, "pg-boss error"));
  return boss;
}

async function createQueues(boss: PgBoss) {
  for (const name of Object.values(JOBS)) await boss.createQueue(name);
}

/** Starts pg-boss and registers job handlers + schedules. */
export async function startWorker() {
  if (g.__featherlogBoss) return g.__featherlogBoss;
  const boss = newBoss();
  await boss.start();
  await createQueues(boss);
  await boss.work(JOBS.purgeIdempotency, async () => {
    await purgeIdempotencyKeys(db);
  });
  await boss.schedule(JOBS.purgeIdempotency, "17 3 * * *");
  await boss.work<NewsletterJob>(JOBS.newsletterGenerate, async ([job]) => {
    if (job) await generateNewsletter(job.data.workspaceId, job.data.newsletterId);
  });
  await boss.work<NewsletterJob>(JOBS.newsletterSend, async ([job]) => {
    if (!job) return;
    const done = await sendNewsletterBatch(job.data.workspaceId, job.data.newsletterId);
    if (!done) await boss.send(JOBS.newsletterSend, job.data);
  });
  g.__featherlogBoss = boss;
  // Resume work a restart interrupted.
  for (const n of await sendingNewsletterIds(db))
    await boss.send(JOBS.newsletterSend, { workspaceId: n.workspaceId, newsletterId: n.id });
  for (const n of await generatingNewsletterIds(db))
    await boss.send(JOBS.newsletterGenerate, { workspaceId: n.workspaceId, newsletterId: n.id });
  logger.info("job worker started");
  return boss;
}

/** A pg-boss instance this process can queue jobs on, or null when no worker runs anywhere. */
async function queue(): Promise<PgBoss | null> {
  if (g.__featherlogBoss) return g.__featherlogBoss;
  if (env.WORKER_MODE !== "separate") return null;
  if (!g.__featherlogBossClient) {
    const boss = newBoss();
    await boss.start();
    await createQueues(boss);
    g.__featherlogBossClient = boss;
  }
  return g.__featherlogBossClient;
}

/** Queues a job for the worker; without one (WORKER_MODE=off) runs it in this process. */
async function dispatch(name: string, data: NewsletterJob, inline: () => Promise<unknown>) {
  const boss = await queue();
  if (boss) {
    await boss.send(name, data);
    return;
  }
  void inline().catch((err) => logger.error({ err, job: name, ...data }, "job failed"));
}

export function queueNewsletterGeneration(workspaceId: string, newsletterId: string) {
  return dispatch(JOBS.newsletterGenerate, { workspaceId, newsletterId }, () =>
    generateNewsletter(workspaceId, newsletterId),
  );
}

export function queueNewsletterSend(workspaceId: string, newsletterId: string) {
  return dispatch(JOBS.newsletterSend, { workspaceId, newsletterId }, async () => {
    while (!(await sendNewsletterBatch(workspaceId, newsletterId))) {}
  });
}

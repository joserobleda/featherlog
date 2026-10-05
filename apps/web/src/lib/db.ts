import { createDb, type Db } from "@featherlog/db";
import { env } from "./env";

const globalForDb = globalThis as unknown as { __featherlogDb?: Db };

/** Shared connection pool (kept across hot reloads in development). */
export const db: Db = globalForDb.__featherlogDb ?? createDb(env.DATABASE_URL).db;
if (env.NODE_ENV !== "production") globalForDb.__featherlogDb = db;

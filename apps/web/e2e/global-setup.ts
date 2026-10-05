import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { seed } from "../scripts/seed";

export const FIXTURE_FILE = fileURLToPath(
  new URL("../../../test-results/e2e-fixture.json", import.meta.url),
);
export const E2E_EMAIL = "e2e-owner@featherlog.test";
export const E2E_PASSWORD = "e2e-password-123";

/** Seeds a fresh "e2e" workspace (en + es, categories, posts) and stores ids/keys for the tests. */
export default async function globalSetup() {
  const data = await seed({
    slug: "e2e",
    email: E2E_EMAIL,
    password: E2E_PASSWORD,
    quiet: true,
    databaseUrl: process.env.DATABASE_URL,
  });
  mkdirSync(dirname(FIXTURE_FILE), { recursive: true });
  writeFileSync(FIXTURE_FILE, JSON.stringify(data));
}

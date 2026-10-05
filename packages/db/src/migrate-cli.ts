import { fileURLToPath } from "node:url";
import { runMigrations } from "./migrate";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
await runMigrations(
  url,
  process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL("../drizzle", import.meta.url)),
);
console.log("Migrations applied");

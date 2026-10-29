// Sets a new password for a user from the command line (for instances without SMTP, where the
// "Forgot password?" email can't be sent). Signs the user out everywhere.
//   pnpm --filter @featherlog/web reset-password <email> [new-password]
// Without a password, a random one is generated and printed.
import { randomBytes } from "node:crypto";
import { setUserPassword } from "@featherlog/core";
import { createDb } from "@featherlog/db";
import { hashPassword } from "better-auth/crypto";

const [email, given] = process.argv.slice(2);
if (!email) {
  console.error("Usage: reset-password.ts <email> [new-password]");
  process.exit(1);
}
if (given !== undefined && given.length < 8) {
  console.error("Error: the password must be at least 8 characters");
  process.exit(1);
}
const password = given ?? randomBytes(12).toString("base64url");
const { db, close } = createDb(
  process.env.DATABASE_URL ?? "postgres://featherlog:featherlog@localhost:5442/featherlog",
);
try {
  await setUserPassword(db, email, await hashPassword(password));
  console.log(given ? "Password updated." : `Password updated. New password: ${password}`);
} catch (err) {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await close();
}

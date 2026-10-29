import { account, session } from "@featherlog/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newId } from "../src/ids";
import { setUserPassword } from "../src/users";
import { createUser, setup } from "./helpers";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  t = await setup();
});
afterAll(() => t.close());

const accountsOf = (userId: string) =>
  t.db.select().from(account).where(eq(account.userId, userId));

describe("setUserPassword", () => {
  it("replaces the password and signs the user out", async () => {
    const uid = await createUser(t.db, "Ada", "ada@example.com");
    await t.db.insert(account).values({
      id: newId(),
      accountId: uid,
      providerId: "credential",
      userId: uid,
      password: "old-hash",
    });
    await t.db.insert(session).values({
      id: newId(),
      token: newId(),
      userId: uid,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await setUserPassword(t.db, " ADA@example.com ", "new-hash");
    expect((await accountsOf(uid)).map((a) => a.password)).toEqual(["new-hash"]);
    expect(await t.db.select().from(session).where(eq(session.userId, uid))).toEqual([]);
  });

  it("adds a password login for users who never had one", async () => {
    const uid = await createUser(t.db, "Grace", "grace@example.com");
    await setUserPassword(t.db, "grace@example.com", "hash");
    expect((await accountsOf(uid)).map((a) => [a.providerId, a.password])).toEqual([
      ["credential", "hash"],
    ]);
  });

  it("fails for unknown emails", async () => {
    await expect(setUserPassword(t.db, "nobody@example.com", "hash")).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

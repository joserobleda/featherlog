import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiKey, listApiKeys, revokeApiKey, verifyApiKey } from "../src/apiKeys";
import { withIdempotency } from "../src/idempotency";
import {
  acceptInvitation,
  changeMemberRole,
  findInvitation,
  inviteMember,
  listMembers,
  removeMember,
  transferOwnership,
} from "../src/members";
import { createUser, setup, workspaceFixture } from "./helpers";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  t = await setup();
});
afterAll(() => t.close());

describe("members & invitations", () => {
  it("invites, accepts and lists members", async () => {
    const f = await workspaceFixture(t.db);
    const { token } = await inviteMember(f.owner, { email: "New@Example.com", role: "editor" });
    expect((await findInvitation(t.db, token))?.invitation.email).toBe("new@example.com");
    const uid = await createUser(t.db, "Newbie", "new@example.com");
    await acceptInvitation(t.db, token, uid);
    expect((await listMembers(t.db, f.ws.id)).map((m) => m.role)).toEqual(["owner", "editor"]);
    await expect(acceptInvitation(t.db, token, uid)).rejects.toMatchObject({ code: "not_found" });
    await expect(inviteMember(f.owner, { email: "new@example.com" })).rejects.toMatchObject({ code: "conflict" });
  });

  it("protects the last owner and owner-only grants", async () => {
    const f = await workspaceFixture(t.db);
    const adminId = await createUser(t.db);
    const { token } = await inviteMember(f.owner, { email: "admin@example.com", role: "admin" });
    await acceptInvitation(t.db, token, adminId);
    const admin = f.userCtx(adminId, "admin");
    await expect(inviteMember(admin, { email: "x@example.com", role: "owner" })).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(changeMemberRole(admin, f.ownerId, "editor")).rejects.toMatchObject({ code: "forbidden" });
    await expect(removeMember(f.owner, f.ownerId)).rejects.toMatchObject({ code: "conflict" });
    await transferOwnership(f.owner, adminId);
    const roles = Object.fromEntries((await listMembers(t.db, f.ws.id)).map((m) => [m.userId, m.role]));
    expect(roles[adminId]).toBe("owner");
    expect(roles[f.ownerId]).toBe("admin");
  });
});

describe("api keys", () => {
  it("creates, verifies and revokes keys; secrets are shown once", async () => {
    const f = await workspaceFixture(t.db);
    const { key, secret } = await createApiKey(f.owner, { name: "CI", scopes: ["posts:read", "posts:write"] });
    expect(secret.startsWith("fl_live_")).toBe(true);
    expect(key.prefix).toBe(secret.slice(0, 14));
    const v = await verifyApiKey(t.db, secret);
    expect(v?.workspaceId).toBe(f.ws.id);
    expect(v?.actor).toMatchObject({ kind: "api_key", label: "CI" });
    expect(await verifyApiKey(t.db, "fl_live_nope")).toBeNull();
    await revokeApiKey(f.owner, key.id);
    expect(await verifyApiKey(t.db, secret)).toBeNull();
    expect(await listApiKeys(f.owner)).toHaveLength(0);
  });

  it("rejects expired keys", async () => {
    const f = await workspaceFixture(t.db);
    const { secret } = await createApiKey(f.owner, {
      name: "old",
      scopes: ["posts:read"],
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await verifyApiKey(t.db, secret)).toBeNull();
  });
});

describe("idempotency", () => {
  it("replays the stored response and rejects key reuse with a different body", async () => {
    let calls = 0;
    const run = () => withIdempotency(t.db, "p1", "k1", '{"a":1}', async () => ({ status: 201, body: { n: ++calls } }));
    const first = await run();
    const second = await run();
    expect(first).toMatchObject({ status: 201, body: { n: 1 }, replayed: false });
    expect(second).toMatchObject({ status: 201, body: { n: 1 }, replayed: true });
    expect(calls).toBe(1);
    await expect(
      withIdempotency(t.db, "p1", "k1", '{"a":2}', async () => ({ status: 201, body: {} })),
    ).rejects.toMatchObject({ code: "validation" });
  });
});

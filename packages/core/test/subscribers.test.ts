import { events } from "@featherlog/db";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Scope } from "../src/auth";
import { MAX_SUBSCRIBER_BATCH } from "../src/subscriber-csv";
import {
  countSubscribers,
  getSubscriber,
  listSubscribers,
  normalizeSubscriberLocale,
  removeSubscriber,
  setSubscriberStatus,
  unsubscribeById,
  upsertSubscriber,
  upsertSubscribersBatch,
} from "../src/subscribers";
import { createUser, setup, workspaceFixture } from "./helpers";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  t = await setup();
});
afterAll(() => t.close());

async function fixture() {
  const f = await workspaceFixture(t.db);
  const key = (scopes: Scope[] = ["subscribers:read", "subscribers:write"]) =>
    f.ctx({ kind: "api_key", apiKeyId: "k1", scopes, label: "Nailted" }, "api");
  return { ...f, api: key(), key };
}

describe("subscribers", () => {
  it("creates by external id, normalizes email and locale, then updates in place", async () => {
    const f = await fixture();
    const a = await upsertSubscriber(f.api, {
      email: "  Ada@Example.com ",
      externalId: "u1",
      name: "Ada",
      locale: "fr-FR",
      attributes: { org: "Acme" },
    });
    expect(a.result).toBe("created");
    expect(a.subscriber).toMatchObject({
      email: "ada@example.com",
      locale: "fr",
      status: "subscribed",
      source: "api",
    });

    const same = await upsertSubscriber(f.api, {
      email: "ada@example.com",
      externalId: "u1",
      name: "Ada",
      locale: "fr",
      attributes: { org: "Acme" },
    });
    expect(same.result).toBe("unchanged");
    const reordered = await upsertSubscriber(f.api, {
      email: "ada@example.com",
      externalId: "u1",
      attributes: { plan: "pro", org: "Acme" },
    });
    expect(reordered.result).toBe("updated");
    const sameReordered = await upsertSubscriber(f.api, {
      email: "ada@example.com",
      externalId: "u1",
      attributes: { org: "Acme", plan: "pro" },
    });
    expect(sameReordered.result).toBe("unchanged");

    const moved = await upsertSubscriber(f.api, { email: "ada@new.com", externalId: "u1" });
    expect(moved.result).toBe("updated");
    expect(moved.subscriber.id).toBe(a.subscriber.id);
    expect(moved.subscriber.email).toBe("ada@new.com");
    expect(moved.subscriber.name).toBe("Ada"); // absent fields are left alone
  });

  it("falls back to null for unsupported languages", () => {
    expect(normalizeSubscriberLocale("nb-NO")).toBeNull();
    expect(normalizeSubscriberLocale("es")).toBe("es");
    expect(normalizeSubscriberLocale(null)).toBeNull();
  });

  it("matches by email when there is no external id yet", async () => {
    const f = await fixture();
    const imported = await upsertSubscriber(
      f.api,
      { email: "bob@example.com", unsubscribed: true },
      { source: "import" },
    );
    expect(imported.subscriber.status).toBe("unsubscribed");
    const synced = await upsertSubscriber(f.api, { email: "bob@example.com", externalId: "u2" });
    expect(synced.subscriber.id).toBe(imported.subscriber.id);
    expect(synced.subscriber.externalId).toBe("u2");
    expect(synced.subscriber.status).toBe("unsubscribed");
  });

  it("never re-subscribes someone who opted out, except from the panel", async () => {
    const f = await fixture();
    const { subscriber } = await upsertSubscriber(f.api, { email: "c@x.com", externalId: "u3" });
    await unsubscribeById(t.db, f.ws.id, subscriber.id);
    const again = await upsertSubscriber(f.api, {
      email: "c@x.com",
      externalId: "u3",
      unsubscribed: false,
    });
    expect(again.subscriber.status).toBe("unsubscribed");

    await expect(setSubscriberStatus(f.api, subscriber.id, "subscribed")).rejects.toMatchObject({
      code: "forbidden",
    });
    const back = await setSubscriberStatus(f.owner, subscriber.id, "subscribed");
    expect(back.status).toBe("subscribed");
    expect(back.unsubscribedAt).toBeNull();

    const evs = await t.db
      .select()
      .from(events)
      .where(and(eq(events.workspaceId, f.ws.id), eq(events.type, "subscriber.unsubscribed")));
    expect(evs).toHaveLength(1);
  });

  it("merges rows when the synced person moves to an email that already exists", async () => {
    const f = await fixture();
    await upsertSubscriber(f.api, { email: "old@x.com", externalId: "u4" });
    await upsertSubscriber(f.api, { email: "dup@x.com", unsubscribed: true }, { source: "import" });
    const merged = await upsertSubscriber(f.api, { email: "dup@x.com", externalId: "u4" });
    expect(merged.subscriber.status).toBe("unsubscribed");
    const counts = await countSubscribers(f.api);
    expect(counts.all).toBe(1);
  });

  it("upserts in batches and rejects oversized or duplicated batches", async () => {
    const f = await fixture();
    const counts = await upsertSubscribersBatch(f.api, [
      { email: "a@x.com", externalId: "1" },
      { email: "b@x.com", externalId: "2" },
    ]);
    expect(counts).toEqual({ created: 2, updated: 0, unchanged: 0 });
    const again = await upsertSubscribersBatch(f.api, [
      { email: "a@x.com", externalId: "1" },
      { email: "b2@x.com", externalId: "2" },
      { email: "c@x.com", externalId: "3" },
    ]);
    expect(again).toEqual({ created: 1, updated: 1, unchanged: 1 });

    await expect(
      upsertSubscribersBatch(f.api, [
        { email: "a@x.com", externalId: "1" },
        { email: "z@x.com", externalId: "1" },
      ]),
    ).rejects.toMatchObject({ code: "validation" });
    const big = Array.from({ length: MAX_SUBSCRIBER_BATCH + 1 }, (_, i) => ({
      email: `p${i}@x.com`,
    }));
    await expect(upsertSubscribersBatch(f.api, big)).rejects.toMatchObject({ code: "validation" });
  });

  it("lists with filters and cursor pagination, and removes by external id", async () => {
    const f = await fixture();
    for (let i = 0; i < 5; i++)
      await upsertSubscriber(f.api, { email: `p${i}@x.com`, externalId: `e${i}` });
    await upsertSubscriber(f.api, { email: "gone@x.com", unsubscribed: true });

    const first = await listSubscribers(f.api, { limit: 4 });
    expect(first.items).toHaveLength(4);
    const second = await listSubscribers(f.api, { limit: 4, cursor: first.nextCursor! });
    expect(second.items).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    expect((await listSubscribers(f.api, { status: "unsubscribed" })).items).toHaveLength(1);
    expect((await listSubscribers(f.api, { q: "p3@" })).items).toHaveLength(1);

    await removeSubscriber(f.api, { externalId: "e0" });
    await expect(getSubscriber(f.api, { externalId: "e0" })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(removeSubscriber(f.api, { externalId: "e0" })).rejects.toMatchObject({
      code: "not_found",
    });
    expect(await countSubscribers(f.api)).toEqual({
      all: 5,
      subscribed: 4,
      unsubscribed: 1,
      bounced: 0,
    });
  });

  it("requires subscriber scopes and keeps workspaces apart", async () => {
    const f = await fixture();
    await expect(
      upsertSubscriber(f.key(["posts:write"]), { email: "a@x.com" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const editorId = await createUser(t.db, "Ed");
    await expect(listSubscribers(f.userCtx(editorId, "editor"))).rejects.toMatchObject({
      code: "forbidden",
    });

    await upsertSubscriber(f.api, { email: "shared@x.com", externalId: "s" });
    const other = await fixture();
    const created = await upsertSubscriber(other.api, { email: "shared@x.com", externalId: "s" });
    expect(created.result).toBe("created");
  });
});

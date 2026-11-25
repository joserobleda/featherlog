import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Scope } from "../src/auth";
import {
  countNewsletterRecipients,
  createNewsletter,
  setNewsletterTranslation,
  startSendingNewsletter,
  updateNewsletterSettings,
} from "../src/newsletters";
import { createPost } from "../src/posts";
import { upsertSubscriber } from "../src/subscribers";
import {
  findSubscriberByExternalId,
  newsletterReadStats,
  recordPostViews,
  seenPostIds,
  setWidgetIdentity,
  verifyWidgetUser,
  widgetUserHash,
} from "../src/views";
import { setup, workspaceFixture } from "./helpers";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  t = await setup();
});
afterAll(() => t.close());

async function fixture() {
  const f = await workspaceFixture(t.db);
  const api = f.ctx(
    { kind: "api_key", apiKeyId: "k", scopes: ["subscribers:write"] as Scope[], label: "Sync" },
    "api",
  );
  const post = (title: string) =>
    createPost(f.owner, {
      translations: { en: { title } },
      publish: true,
      publishedAt: new Date(Date.now() - 86_400_000),
    });
  return { ...f, api, post };
}

describe("identified widget users and post views", () => {
  it("signs user ids with the workspace secret", async () => {
    const f = await fixture();
    const on = await setWidgetIdentity(f.owner, "enable");
    expect(on.identitySecret).toMatch(/^fl_wid_/);
    expect((await setWidgetIdentity(f.owner, "enable")).identitySecret).toBe(on.identitySecret);
    const hash = widgetUserHash(on.identitySecret!, "42");
    expect(verifyWidgetUser(on.identitySecret!, "42", hash)).toBe(true);
    expect(verifyWidgetUser(on.identitySecret!, "43", hash)).toBe(false);
    expect(verifyWidgetUser(on.identitySecret!, "42", "zz")).toBe(false);
    const rotated = await setWidgetIdentity(f.owner, "rotate");
    expect(verifyWidgetUser(rotated.identitySecret!, "42", hash)).toBe(false);
    expect((await setWidgetIdentity(f.owner, "disable")).identitySecret).toBeNull();
  });

  it("records each post once per subscriber and ignores other workspaces", async () => {
    const f = await fixture();
    const other = await fixture();
    const a = await f.post("A");
    const foreign = await other.post("X");
    const { subscriber } = await upsertSubscriber(f.api, { email: "u@x.com", externalId: "42" });
    expect((await findSubscriberByExternalId(t.db, f.ws.id, "42"))?.id).toBe(subscriber.id);
    expect(await findSubscriberByExternalId(t.db, other.ws.id, "42")).toBeNull();

    expect(
      await recordPostViews(t.db, f.ws.id, subscriber.id, [a.id, a.id, foreign.id], "widget"),
    ).toBe(1);
    expect(await recordPostViews(t.db, f.ws.id, subscriber.id, [a.id], "email")).toBe(0);
    expect(await seenPostIds(t.db, f.ws.id, subscriber.id)).toEqual([a.id]);
  });

  it("can skip subscribers who already read everything in the widget", async () => {
    const f = await fixture();
    const a = await f.post("A");
    const b = await f.post("B");
    const reader = await upsertSubscriber(f.api, { email: "reader@x.com" });
    const half = await upsertSubscriber(f.api, { email: "half@x.com" });
    await upsertSubscriber(f.api, { email: "new@x.com" });
    await recordPostViews(t.db, f.ws.id, reader.subscriber.id, [a.id, b.id], "widget");
    await recordPostViews(t.db, f.ws.id, half.subscriber.id, [a.id], "widget");

    const nl = await createNewsletter(f.owner, {});
    await setNewsletterTranslation(f.owner, nl.id, "en", { subject: "News" });
    expect(await countNewsletterRecipients(f.owner, nl.id)).toEqual({
      recipients: 3,
      skippedReaders: 0,
    });
    await updateNewsletterSettings(f.owner, { skipReaders: true });
    expect(await countNewsletterRecipients(f.owner, nl.id)).toEqual({
      recipients: 2,
      skippedReaders: 1,
    });
    expect(await startSendingNewsletter(f.owner, nl.id)).toEqual({ recipients: 2 });

    await recordPostViews(t.db, f.ws.id, half.subscriber.id, [b.id], "email");
    const stats = await newsletterReadStats(f.owner, nl.id);
    expect(stats.posts[a.id]).toEqual({ widget: 2, email: 0 });
    expect(stats.posts[b.id]).toEqual({ widget: 1, email: 1 });
    expect(stats.emailReaders).toBe(1);
  });
});

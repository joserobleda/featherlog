import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Scope } from "../src/auth";
import {
  createNewsletter,
  getNewsletter,
  pendingDeliveries,
  recordDelivery,
  setNewsletterTranslation,
  startSendingNewsletter,
} from "../src/newsletters";
import { createPost } from "../src/posts";
import { applyEmailFeedback, getSubscriber, upsertSubscriber } from "../src/subscribers";
import { setup, workspaceFixture } from "./helpers";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  t = await setup();
});
afterAll(() => t.close());

async function fixture() {
  const f = await workspaceFixture(t.db);
  const api = f.ctx(
    {
      kind: "api_key",
      apiKeyId: "k",
      scopes: ["subscribers:read", "subscribers:write"] as Scope[],
      label: "Sync",
    },
    "api",
  );
  return { ...f, api };
}

describe("email provider feedback", () => {
  it("marks permanent bounces and moves the delivery to failed", async () => {
    const f = await fixture();
    await createPost(f.owner, {
      translations: { en: { title: "A" } },
      publish: true,
      publishedAt: new Date(Date.now() - 60_000),
    });
    const { subscriber } = await upsertSubscriber(f.api, { email: "gone@x.com", externalId: "1" });
    const nl = await createNewsletter(f.owner, {});
    await setNewsletterTranslation(f.owner, nl.id, "en", { subject: "News" });
    await startSendingNewsletter(f.owner, nl.id);
    const [d] = await pendingDeliveries(t.db, nl.id, 10);
    await recordDelivery(t.db, nl.id, d!.subscriberId, { ok: true });

    const r = await applyEmailFeedback(t.db, {
      workspaceId: f.ws.id,
      subscriberId: subscriber.id,
      newsletterId: nl.id,
      kind: "bounced",
      reason: "550 mailbox does not exist",
    });
    expect(r).toEqual({ status: "bounced" });
    expect(await getNewsletter(f.owner, nl.id)).toMatchObject({ sentCount: 0, failedCount: 1 });
    // A second webhook for the same bounce changes nothing.
    await applyEmailFeedback(t.db, {
      workspaceId: f.ws.id,
      subscriberId: subscriber.id,
      newsletterId: nl.id,
      kind: "bounced",
    });
    expect(await getNewsletter(f.owner, nl.id)).toMatchObject({ sentCount: 0, failedCount: 1 });

    // The sync can't revive it with the same address, but a new address is tried again.
    await upsertSubscriber(f.api, { email: "gone@x.com", externalId: "1" });
    expect((await getSubscriber(f.api, { externalId: "1" })).status).toBe("bounced");
    await upsertSubscriber(f.api, { email: "new@x.com", externalId: "1" });
    expect((await getSubscriber(f.api, { externalId: "1" })).status).toBe("subscribed");
  });

  it("opts out on complaints, even after a bounce, and ignores other workspaces", async () => {
    const f = await fixture();
    const other = await fixture();
    const { subscriber } = await upsertSubscriber(f.api, { email: "a@x.com" });
    expect(
      await applyEmailFeedback(t.db, {
        workspaceId: other.ws.id,
        subscriberId: subscriber.id,
        kind: "complained",
      }),
    ).toBeNull();
    await applyEmailFeedback(t.db, {
      workspaceId: f.ws.id,
      subscriberId: subscriber.id,
      kind: "bounced",
    });
    expect(
      await applyEmailFeedback(t.db, {
        workspaceId: f.ws.id,
        subscriberId: subscriber.id,
        kind: "complained",
      }),
    ).toEqual({ status: "unsubscribed" });
    const s = await getSubscriber(f.api, { id: subscriber.id });
    expect(s.unsubscribedAt).toBeInstanceOf(Date);
    // A bounce after an opt-out keeps the opt-out.
    expect(
      await applyEmailFeedback(t.db, {
        workspaceId: f.ws.id,
        subscriberId: subscriber.id,
        kind: "bounced",
      }),
    ).toEqual({ status: "unsubscribed" });
  });
});

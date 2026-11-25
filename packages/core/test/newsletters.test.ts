import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Scope } from "../src/auth";
import {
  completeNewsletterDraft,
  countRecipients,
  createNewsletter,
  deleteNewsletter,
  failNewsletter,
  finishSendingIfDone,
  getNewsletter,
  getNewsletterSettings,
  listCandidatePosts,
  listNewsletters,
  markNewsletterGenerating,
  newsletterLocaleFor,
  pendingDeliveries,
  recordDelivery,
  removeNewsletterPosts,
  setNewsletterTranslation,
  startSendingNewsletter,
  updateNewsletterSettings,
} from "../src/newsletters";
import { createPost } from "../src/posts";
import { unsubscribeById, upsertSubscriber } from "../src/subscribers";
import { createUser, setup, workspaceFixture } from "./helpers";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  t = await setup();
});
afterAll(() => t.close());

const day = 86_400_000;

async function fixture() {
  const f = await workspaceFixture(t.db, { locales: ["en", "es"] });
  const api = (scopes: Scope[] = ["newsletters:read", "newsletters:write", "subscribers:write"]) =>
    f.ctx({ kind: "api_key", apiKeyId: "k1", scopes, label: "Bot" }, "api");
  const post = (title: string, opts: { daysAgo?: number; publish?: boolean } = {}) =>
    createPost(f.owner, {
      translations: { en: { title, contentMd: `About ${title}.` } },
      publish: opts.publish ?? true,
      publishedAt: new Date(Date.now() - (opts.daysAgo ?? 1) * day),
    });
  return { ...f, api, post };
}

describe("newsletters", () => {
  it("collects published posts not sent yet, oldest first", async () => {
    const f = await fixture();
    const b = await f.post("B", { daysAgo: 1 });
    const a = await f.post("A", { daysAgo: 3 });
    await f.post("Draft", { publish: false });
    await createPost(f.owner, {
      translations: { en: { title: "Future" } },
      publish: true,
      publishedAt: new Date(Date.now() + day),
    });
    expect((await listCandidatePosts(f.owner)).map((p) => p.id)).toEqual([a.id, b.id]);

    const nl = await createNewsletter(f.owner, { featuredPostIds: [b.id] });
    expect(nl.status).toBe("draft");
    expect(nl.posts).toEqual([
      { postId: a.id, position: 0, featured: false },
      { postId: b.id, position: 1, featured: true },
    ]);
    expect(nl.periodFrom?.getTime()).toBe(a.publishedAt!.getTime());
    expect(await listCandidatePosts(f.owner)).toEqual([]);
    await expect(createNewsletter(f.owner, {})).rejects.toMatchObject({ code: "validation" });

    // Taking a post out of a draft makes it a candidate again; deleting the draft frees the rest.
    await removeNewsletterPosts(f.owner, nl.id, [a.id]);
    expect((await listCandidatePosts(f.owner)).map((p) => p.id)).toEqual([a.id]);
    await deleteNewsletter(f.owner, nl.id);
    expect(await listCandidatePosts(f.owner)).toHaveLength(2);
  });

  it("rejects posts that are not candidates", async () => {
    const f = await fixture();
    const draft = await f.post("Draft", { publish: false });
    await expect(createNewsletter(f.owner, { postIds: [draft.id] })).rejects.toMatchObject({
      code: "validation",
      details: { postIds: [draft.id] },
    });
  });

  it("goes from generating to draft with the writer's output, or to failed", async () => {
    const f = await fixture();
    const a = await f.post("A", { daysAgo: 2 });
    const b = await f.post("B", { daysAgo: 1 });
    const nl = await createNewsletter(f.api(), { status: "generating", generator: "ai" });
    expect(nl).toMatchObject({ status: "generating", createdVia: "api", actorLabel: "Bot" });

    await failNewsletter(t.db, f.ws.id, nl.id, "Rate limited");
    expect((await getNewsletter(f.owner, nl.id)).error).toBe("Rate limited");

    await completeNewsletterDraft(t.db, f.ws.id, nl.id, {
      generator: "ai",
      translations: {
        en: { subject: "What's new", preheader: "Two things", contentMd: "Hi" },
        es: { subject: "Novedades", contentMd: "Hola" },
      },
      posts: [{ postId: b.id, featured: true }],
    });
    const done = await getNewsletter(f.owner, nl.id);
    expect(done).toMatchObject({ status: "draft", generator: "ai", error: null, version: 2 });
    expect(Object.keys(done.translations).sort()).toEqual(["en", "es"]);
    expect(done.posts).toEqual([
      { postId: b.id, position: 0, featured: true },
      { postId: a.id, position: 1, featured: false },
    ]);
    await expect(
      completeNewsletterDraft(t.db, f.ws.id, nl.id, { generator: "ai", translations: {} }),
    ).rejects.toMatchObject({ code: "conflict" });

    await markNewsletterGenerating(f.owner, nl.id);
    expect((await getNewsletter(f.owner, nl.id)).status).toBe("generating");
  });

  it("edits translations with optimistic concurrency and enabled languages only", async () => {
    const f = await fixture();
    await f.post("A");
    const nl = await createNewsletter(f.owner, {});
    const edited = await setNewsletterTranslation(
      f.owner,
      nl.id,
      "en",
      { subject: "Hello", contentMd: "Body" },
      { expectedVersion: 1 },
    );
    expect(edited.version).toBe(2);
    await expect(
      setNewsletterTranslation(f.owner, nl.id, "en", { subject: "X" }, { expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: "precondition_failed" });
    await expect(
      setNewsletterTranslation(f.owner, nl.id, "fr", { subject: "Salut" }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("sends only from the dashboard, to subscribed people, in their language", async () => {
    const f = await fixture();
    await f.post("A");
    const api = f.api();
    await upsertSubscriber(api, { email: "es@x.com", locale: "es-MX" });
    await upsertSubscriber(api, { email: "fr@x.com", locale: "fr" });
    const out = await upsertSubscriber(api, { email: "out@x.com" });
    await unsubscribeById(t.db, f.ws.id, out.subscriber.id);
    expect(await countRecipients(f.owner)).toBe(2);

    const nl = await createNewsletter(f.owner, {});
    await expect(startSendingNewsletter(f.owner, nl.id)).rejects.toMatchObject({
      code: "validation",
    });
    await setNewsletterTranslation(f.owner, nl.id, "en", { subject: "News", contentMd: "Hi" });
    await setNewsletterTranslation(f.owner, nl.id, "es", { subject: "Novedades" });
    await expect(startSendingNewsletter(api, nl.id)).rejects.toMatchObject({ code: "forbidden" });

    expect(await startSendingNewsletter(f.owner, nl.id)).toEqual({ recipients: 2 });
    await expect(startSendingNewsletter(f.owner, nl.id)).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(
      setNewsletterTranslation(f.owner, nl.id, "en", { subject: "Late edit" }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(deleteNewsletter(f.owner, nl.id)).rejects.toMatchObject({ code: "conflict" });

    const pending = await pendingDeliveries(t.db, nl.id, 10);
    expect(Object.fromEntries(pending.map((d) => [d.email, d.locale]))).toEqual({
      "es@x.com": "es",
      "fr@x.com": "en",
    });
    await recordDelivery(t.db, nl.id, pending[0]!.subscriberId, { ok: true });
    await recordDelivery(t.db, nl.id, pending[0]!.subscriberId, { ok: true }); // no double count
    expect(await finishSendingIfDone(t.db, f.ws.id, nl.id)).toBe(false);
    await recordDelivery(t.db, nl.id, pending[1]!.subscriberId, { ok: false, error: "550" });
    expect(await finishSendingIfDone(t.db, f.ws.id, nl.id)).toBe(true);

    const sent = await getNewsletter(f.owner, nl.id);
    expect(sent).toMatchObject({ status: "sent", recipients: 2, sentCount: 1, failedCount: 1 });
    expect(sent.sentAt).toBeInstanceOf(Date);
    expect((await listNewsletters(f.owner)).map((n) => n.id)).toEqual([nl.id]);
  });

  it("picks the subscriber's language, then the default, then any", () => {
    expect(newsletterLocaleFor("es", ["en", "es"], "en")).toBe("es");
    expect(newsletterLocaleFor(null, ["en", "es"], "es")).toBe("es");
    expect(newsletterLocaleFor("fr", ["de"], "en")).toBe("de");
  });

  it("keeps settings per workspace and restricts newsletters to admins", async () => {
    const f = await fixture();
    expect(await getNewsletterSettings(t.db, f.ws.id)).toMatchObject({ footerText: "" });
    const s = await updateNewsletterSettings(f.owner, {
      fromName: "Acme",
      replyTo: "",
      footerText: "Acme Inc · Street 1",
    });
    expect(s).toMatchObject({ fromName: "Acme", replyTo: null });
    const editor = await createUser(t.db, "Ed");
    await expect(listNewsletters(f.userCtx(editor, "editor"))).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

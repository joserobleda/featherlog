import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCategory } from "../src/categories";
import { getPublicFeed, getPublicPost } from "../src/feed";
import {
  countPendingReview,
  countPostsByStatus,
  createPost,
  deletePost,
  deleteTranslation,
  getPost,
  ListPostsInput,
  listPosts,
  publishPost,
  requestReview,
  schedulePost,
  setTranslation,
  unpublishPost,
  updatePost,
  withdrawReview,
} from "../src/posts";
import { updateWorkspace } from "../src/workspaces";
import { createUser, setup, workspaceFixture } from "./helpers";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  t = await setup();
});
afterAll(() => t.close());

describe("posts", () => {
  it("creates a draft, renders markdown and derives categories from inline markers", async () => {
    const f = await workspaceFixture(t.db);
    const post = await createPost(f.owner, {
      translations: {
        en: { title: "Dark mode is here!", contentMd: "[New]\n\nYou can now **switch** themes." },
      },
    });
    expect(post.status).toBe("draft");
    expect(post.translations.en?.slug).toBe("dark-mode-is-here");
    expect(post.translations.en?.contentHtml).toContain("<strong>switch</strong>");
    expect(post.translations.en?.excerpt).toContain("You can now switch themes.");
    expect(post.categoryIds).toHaveLength(1);
    expect(post.createdVia).toBe("panel");
    expect(post.author?.name).toBe("Owner");
  });

  it("publishes, schedules and unpublishes; visibility follows publishedAt without cron", async () => {
    const f = await workspaceFixture(t.db);
    const p = await createPost(f.owner, {
      translations: { en: { title: "Soon", contentMd: "x" } },
    });
    const future = new Date(Date.now() + 60_000);
    const scheduled = await schedulePost(f.owner, p.id, future);
    expect(scheduled.status).toBe("scheduled");
    expect((await getPublicFeed(t.db, f.ws, { locale: "en" })).items).toHaveLength(0);
    const later = await getPublicFeed(t.db, f.ws, {
      locale: "en",
      now: new Date(Date.now() + 120_000),
    });
    expect(later.items.map((i) => i.title)).toEqual(["Soon"]);

    const published = await publishPost(f.owner, p.id, { at: new Date() });
    expect(published.status).toBe("published");
    expect((await getPublicFeed(t.db, f.ws, { locale: "en" })).items).toHaveLength(1);
    const draft = await unpublishPost(f.owner, p.id);
    expect(draft.status).toBe("draft");
    expect((await getPublicFeed(t.db, f.ws, { locale: "en" })).items).toHaveLength(0);
    await expect(schedulePost(f.owner, p.id, new Date(Date.now() - 1000))).rejects.toMatchObject({
      code: "validation",
    });
  });

  it("enforces optimistic concurrency with versions", async () => {
    const f = await workspaceFixture(t.db);
    const p = await createPost(f.owner, { translations: { en: { title: "V1" } } });
    const v2 = await updatePost(
      f.owner,
      p.id,
      { translations: { en: { title: "V2" } } },
      { expectedVersion: p.version },
    );
    expect(v2.version).toBe(p.version + 1);
    await expect(
      updatePost(
        f.owner,
        p.id,
        { translations: { en: { title: "stale" } } },
        { expectedVersion: p.version },
      ),
    ).rejects.toMatchObject({ code: "precondition_failed" });
  });

  it("manages translations and rejects disabled locales", async () => {
    const f = await workspaceFixture(t.db, { locales: ["en", "es"] });
    const p = await createPost(f.owner, {
      translations: { en: { title: "Hello", contentMd: "Hi" } },
    });
    const withEs = await setTranslation(f.owner, p.id, "es", {
      title: "Hola",
      contentMd: "Buenas",
    });
    expect(Object.keys(withEs.translations).sort()).toEqual(["en", "es"]);
    await expect(setTranslation(f.owner, p.id, "fr", { title: "Salut" })).rejects.toMatchObject({
      code: "validation",
    });
    const onlyEs = await updatePost(f.owner, p.id, { translations: { en: null } });
    expect(Object.keys(onlyEs.translations)).toEqual(["es"]);
    await expect(updatePost(f.owner, p.id, { translations: { es: null } })).rejects.toMatchObject({
      code: "validation",
    });
  });

  it("resolves public posts per locale with fallback or hide policies", async () => {
    const f = await workspaceFixture(t.db, { locales: ["en", "es"] });
    await createPost(f.owner, { translations: { en: { title: "Only English" } }, publish: true });
    await createPost(f.owner, {
      translations: { en: { title: "Both EN" }, es: { title: "Ambos ES" } },
      publish: true,
    });
    const es = await getPublicFeed(t.db, f.ws, { locale: "es" });
    expect(es.items.map((i) => [i.title, i.isFallback])).toEqual(
      expect.arrayContaining([
        ["Only English", true],
        ["Ambos ES", false],
      ]),
    );
    const ws = await updateWorkspace(f.owner, { missingTranslation: "hide" });
    const hidden = await getPublicFeed(t.db, ws, { locale: "es" });
    expect(hidden.items.map((i) => i.title)).toEqual(["Ambos ES"]);
    const onlyEn = es.items.find((i) => i.title === "Only English")!;
    expect(await getPublicPost(t.db, ws, onlyEn.publicId, "es")).toBeNull();
    expect((await getPublicPost(t.db, ws, onlyEn.publicId, "en"))?.title).toBe("Only English");
    // Unknown locale falls back to default
    expect((await getPublicFeed(t.db, ws, { locale: "de" })).locale).toBe("en");
  });

  it("paginates the public feed and filters by category", async () => {
    const f = await workspaceFixture(t.db);
    const cat = await createCategory(f.owner, { color: "#00AA00", names: { en: "Security" } });
    for (let i = 0; i < 5; i++) {
      await createPost(f.owner, {
        translations: { en: { title: `Post ${i}`, contentMd: i % 2 ? "[Security]\n\nx" : "y" } },
        publish: true,
        publishedAt: new Date(Date.now() - (5 - i) * 1000),
      });
    }
    const p1 = await getPublicFeed(t.db, f.ws, { locale: "en", limit: 2 });
    expect(p1.items.map((i) => i.title)).toEqual(["Post 4", "Post 3"]);
    const p2 = await getPublicFeed(t.db, f.ws, { locale: "en", limit: 2, cursor: p1.nextCursor });
    expect(p2.items.map((i) => i.title)).toEqual(["Post 2", "Post 1"]);
    const p3 = await getPublicFeed(t.db, f.ws, { locale: "en", limit: 2, cursor: p2.nextCursor });
    expect(p3.items.map((i) => i.title)).toEqual(["Post 0"]);
    expect(p3.nextCursor).toBeNull();
    const sec = await getPublicFeed(t.db, f.ws, { locale: "en", categorySlug: "security" });
    expect(sec.items.map((i) => i.title)).toEqual(["Post 3", "Post 1"]);
    expect(sec.items[0]?.categories[0]).toMatchObject({
      id: cat.id,
      name: "Security",
      color: "#00AA00",
    });
  });

  it("lists posts for the panel with status filters, search and counts", async () => {
    const f = await workspaceFixture(t.db);
    await createPost(f.owner, { translations: { en: { title: "Draft about billing" } } });
    await createPost(f.owner, { translations: { en: { title: "Live one" } }, publish: true });
    await createPost(f.owner, {
      translations: { en: { title: "Future" } },
      publish: true,
      publishedAt: new Date(Date.now() + 3_600_000),
    });
    expect(
      (await listPosts(f.owner, { status: "draft" })).items.map((p) => p.translations.en?.title),
    ).toEqual(["Draft about billing"]);
    expect((await listPosts(f.owner, { status: "scheduled" })).items).toHaveLength(1);
    expect((await listPosts(f.owner, { q: "billing" })).items).toHaveLength(1);
    expect(await countPostsByStatus(f.owner)).toEqual({
      all: 3,
      draft: 1,
      in_review: 0,
      scheduled: 1,
      published: 1,
    });
    const page = await listPosts(f.owner, { limit: 2 });
    expect(page.items).toHaveLength(2);
    const rest = await listPosts(f.owner, { limit: 2, cursor: page.nextCursor! });
    expect(rest.items).toHaveLength(1);
  });

  it("refuses to delete the last translation", async () => {
    const f = await workspaceFixture(t.db, { locales: ["en", "es"] });
    const p = await createPost(f.owner, {
      translations: { en: { title: "Hello" }, es: { title: "Hola" } },
    });
    const onlyEn = await deleteTranslation(f.owner, p.id, "es");
    expect(Object.keys(onlyEn.translations)).toEqual(["en"]);
    await expect(deleteTranslation(f.owner, p.id, "en")).rejects.toMatchObject({
      code: "validation",
    });
    expect(Object.keys((await getPost(f.owner, p.id)).translations)).toEqual(["en"]);
  });

  it("filters panel posts by locale and missing locale", async () => {
    const f = await workspaceFixture(t.db, { locales: ["en", "es"] });
    await createPost(f.owner, { translations: { en: { title: "EN only" } } });
    await createPost(f.owner, { translations: { es: { title: "ES only" } } });
    await createPost(f.owner, {
      translations: { en: { title: "Both" }, es: { title: "Ambos" } },
    });
    const titles = (items: { translations: Record<string, { title: string }> }[]) =>
      items.map((p) => Object.values(p.translations)[0]?.title);
    const missingEs = await listPosts(f.owner, { missingLocale: "es" });
    expect(titles(missingEs.items)).toEqual(["EN only"]);
    const missingEn = await listPosts(f.owner, { missingLocale: "en" });
    expect(titles(missingEn.items)).toEqual(["ES only"]);
    const withEs = await listPosts(f.owner, { locale: "es" });
    expect(withEs.items).toHaveLength(2);
    expect(withEs.items.every((p) => p.translations.es)).toBe(true);
    expect(() => ListPostsInput.parse({ missingLocale: "xx" })).toThrow();
  });

  it("builds excerpts without category chips, embeds or stray spaces", async () => {
    const f = await workspaceFixture(t.db);
    const p = await createPost(f.owner, {
      translations: {
        en: {
          title: "Dark",
          contentMd:
            "[New] [Fix]\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ\n\nTurn on **dark mode**.",
        },
      },
    });
    expect(p.categoryIds).toHaveLength(2);
    expect(p.translations.en?.contentHtml).toContain("fl-video");
    expect(p.translations.en?.excerpt).toBe("Turn on dark mode.");
    expect(p.translations.en?.text).toBe("Turn on dark mode.");
  });

  it("soft-deletes posts", async () => {
    const f = await workspaceFixture(t.db);
    const p = await createPost(f.owner, { translations: { en: { title: "Bye" } } });
    await deletePost(f.owner, p.id);
    await expect(getPost(f.owner, p.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("permissions", () => {
  it("editors edit only their own posts; admins edit any", async () => {
    const f = await workspaceFixture(t.db);
    const own = await createPost(f.owner, { translations: { en: { title: "Owner post" } } });
    const editorId = await createUser(t.db, "Ed");
    const editor = f.userCtx(editorId, "editor");
    await expect(
      updatePost(editor, own.id, { translations: { en: { title: "x" } } }),
    ).rejects.toMatchObject({
      code: "forbidden",
    });
    const mine = await createPost(editor, { translations: { en: { title: "Editor post" } } });
    expect(
      (await updatePost(editor, mine.id, { translations: { en: { title: "Edited" } } }))
        .translations.en?.title,
    ).toBe("Edited");
    const admin = f.userCtx(await createUser(t.db), "admin");
    await expect(
      updatePost(admin, mine.id, { translations: { en: { title: "By admin" } } }),
    ).resolves.toBeTruthy();
  });

  it("integrations create drafts; their publish requests go to review unless the workspace allows it", async () => {
    const f = await workspaceFixture(t.db);
    const key = f.ctx(
      {
        kind: "api_key",
        apiKeyId: "k1",
        label: "CI bot",
        scopes: ["posts:read", "posts:write", "posts:publish"],
      },
      "api",
    );
    const draft = await createPost(key, { translations: { en: { title: "From CI" } } });
    expect(draft.createdVia).toBe("api");
    expect(draft.actorLabel).toBe("CI bot");
    expect(draft.author).toBeNull();
    expect((await publishPost(key, draft.id)).status).toBe("in_review");
    const viaCreate = await createPost(key, { translations: { en: { title: "x" } }, publish: true });
    expect(viaCreate.status).toBe("in_review");
    expect(viaCreate.published).toBe(false);
    await updateWorkspace(f.owner, { integrationsCanPublish: true });
    expect((await publishPost(key, draft.id)).status).toBe("published");
    await updateWorkspace(f.owner, { integrationsCanPublish: false });
    // Published posts are off-limits to integrations again
    await expect(
      updatePost(key, draft.id, { translations: { en: { title: "edit" } } }),
    ).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("review queue: integrations ask, a person approves or returns it to drafts", async () => {
    const f = await workspaceFixture(t.db);
    const key = f.ctx(
      { kind: "api_key", apiKeyId: "k9", label: "Cursor", scopes: ["posts:read", "posts:write"] },
      "mcp",
    );
    const later = new Date(Date.now() + 86_400_000);
    const a = await createPost(key, { translations: { en: { title: "A" } } });
    const queued = await schedulePost(key, a.id, later);
    expect(queued.status).toBe("in_review");
    expect(queued.review?.requestedBy).toBe("Cursor");
    expect(queued.publishedAt?.getTime()).toBe(later.getTime());
    const b = await createPost(key, {
      translations: { en: { title: "B" } },
      submitForReview: true,
    });
    expect(b.status).toBe("in_review");
    expect(await countPendingReview(t.db, f.ws.id)).toBe(2);
    expect((await countPostsByStatus(f.owner)).in_review).toBe(2);
    expect((await countPostsByStatus(f.owner)).draft).toBe(0);
    const queue = await listPosts(f.owner, { status: "in_review" });
    expect(queue.items.map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
    expect((await listPosts(f.owner, { status: "draft" })).items).toHaveLength(0);
    // Nothing is public while waiting.
    expect((await getPublicFeed(t.db, f.ws, { locale: "en" })).items).toHaveLength(0);

    // Approving = publishing from the dashboard: keeps the requested future date…
    const approved = await publishPost(f.owner, a.id);
    expect(approved.status).toBe("scheduled");
    expect(approved.review).toBeNull();
    expect(approved.publishedAt?.getTime()).toBe(later.getTime());
    // …and returning to drafts takes it out of the queue.
    const back = await withdrawReview(f.owner, b.id);
    expect(back.status).toBe("draft");
    expect(await countPendingReview(t.db, f.ws.id)).toBe(0);

    // A requested date that already passed publishes now.
    const c = await createPost(key, {
      translations: { en: { title: "C" } },
      publishedAt: new Date("2020-01-01"),
    });
    await requestReview(key, c.id);
    const cNow = await publishPost(f.owner, c.id);
    expect(cNow.status).toBe("published");
    expect(cNow.publishedAt!.getTime()).toBeGreaterThan(Date.now() - 60_000);
    // Published posts cannot be sent to review.
    await expect(requestReview(f.owner, c.id)).rejects.toMatchObject({ code: "validation" });
  });

  it("api keys without the publish scope cannot publish", async () => {
    const f = await workspaceFixture(t.db);
    await updateWorkspace(f.owner, { integrationsCanPublish: true });
    const key = f.ctx(
      { kind: "api_key", apiKeyId: "k2", label: "ro", scopes: ["posts:read", "posts:write"] },
      "api",
    );
    const p = await createPost(key, { translations: { en: { title: "x" } } });
    await expect(publishPost(key, p.id)).rejects.toMatchObject({ code: "forbidden" });
    const ro = f.ctx(
      { kind: "api_key", apiKeyId: "k3", label: "ro", scopes: ["posts:read"] },
      "api",
    );
    await expect(createPost(ro, { translations: { en: { title: "x" } } })).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("OAuth sessions are limited to the intersection of role and scopes", async () => {
    const f = await workspaceFixture(t.db);
    const oauth = f.ctx(
      { kind: "user", userId: f.ownerId, role: "owner", scopes: ["posts:read"] },
      "mcp",
    );
    await expect(createPost(oauth, { translations: { en: { title: "x" } } })).rejects.toMatchObject(
      {
        code: "forbidden",
      },
    );
  });
});

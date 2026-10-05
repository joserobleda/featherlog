import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.UPLOADS_DIR = mkdtempSync(path.join(tmpdir(), "fl-import-"));

const { headwayToMarkdown, pairEntries, parseHeadwayPage } = await import(
  "../src/server/import/headway"
);
type Entry = import("../src/server/import/headway").HeadwayEntry;

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/headway/${name}`, import.meta.url), "utf8");

const entry = (id: string, date: string, extra: Partial<Entry> = {}): Entry => ({
  id,
  account: "acc",
  title: `t${id}`,
  date,
  html: "<p>x</p>",
  categories: ["New"],
  images: [],
  url: `https://headwayapp.co/acc/t-${id}`,
  ...extra,
});

describe("parseHeadwayPage", () => {
  it("extracts entries, categories, images and the pagination cursor from a real page", () => {
    const { entries, next } = parseHeadwayPage(fixture("en-page1.html"), "nailted-changelog");
    expect(entries.length).toBe(10);
    const first = entries[0]!;
    expect(first.id).toMatch(/^\d+$/);
    expect(first.title.length).toBeGreaterThan(5);
    expect(first.date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(first.categories).toEqual(["New"]);
    expect(first.images[0]).toMatch(/^https:\/\/cloud\.headwayapp\.co\//);
    expect(next).toMatch(/^https:\/\/headwayapp\.co\/nailted-changelog\?after=/);
  });

  it("parses the Spanish account too", () => {
    const { entries } = parseHeadwayPage(fixture("es-page1.html"), "nailted-es-updates");
    expect(entries.length).toBe(10);
    expect(entries.some((e) => /[áéíóúñ¿]/.test(e.title))).toBe(true);
  });
});

describe("headwayToMarkdown", () => {
  const html = `<span class="beforeCategories">&nbsp;</span><h3 class='category category_1'>New</h3>&nbsp;<h3 class='category category_2'>Fix</h3><span class="afterCategories">&nbsp;</span>
<p><img src="https://cloud.headwayapp.co/a/big/1.gif" alt="Demo" width=560.0 height=315.0/></p>
<p>You can now <strong>do things</strong>.</p><h3>Why?</h3><ul><li>One</li><li>Two</li></ul><ol><li>First</li></ol>`;

  it("turns category labels into inline markers and keeps formatting", () => {
    const md = headwayToMarkdown({ html, categories: ["New", "Fix"] });
    expect(md.startsWith("[New] [Fix]\n\n")).toBe(true);
    expect(md).toContain("**do things**");
    expect(md).toContain("### Why?");
    expect(md).toContain("- One\n- Two");
    expect(md).toContain("1. First");
    expect(md).not.toContain("beforeCategories");
    expect(md).not.toMatch(/width|height/);
  });

  it("rewrites re-hosted image URLs", () => {
    const md = headwayToMarkdown(
      { html, categories: [] },
      new Map([["https://cloud.headwayapp.co/a/big/1.gif", "https://fl.test/uploads/x.gif"]]),
    );
    expect(md).toContain("![Demo](https://fl.test/uploads/x.gif)");
  });
});

describe("pairEntries", () => {
  const src = (locale: string, entries: Entry[]) => ({ account: locale, locale, entries });

  it("pairs one entry per language on the same day", () => {
    const g = pairEntries([
      src("en", [entry("10", "2024-01-01T10:00:00Z")]),
      src("es", [entry("20", "2024-01-01T08:00:00Z")]),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0]!.match).toBe("same-day");
    expect(g[0]!.items.es!.id).toBe("20");
  });

  it("uses creation order (ids) when several entries share a day", () => {
    const at = "2024-01-01T09:00:00Z";
    const g = pairEntries([
      src("en", [entry("103", at), entry("101", at), entry("102", at)]),
      src("es", [entry("202", at), entry("203", at), entry("201", at)]),
    ]);
    const pairs = g.map((x) => [x.items.en!.id, x.items.es!.id]).sort();
    expect(pairs).toEqual([
      ["101", "201"],
      ["102", "202"],
      ["103", "203"],
    ]);
  });

  it("prefers shared images over order", () => {
    const at = "2024-01-01T09:00:00Z";
    const g = pairEntries([
      src("en", [entry("1", at, { images: ["https://c/x/a.png"] }), entry("2", at)]),
      src("es", [entry("3", at), entry("4", at, { images: ["https://c/y/a.png"] })]),
    ]);
    const byEn = Object.fromEntries(g.map((x) => [x.items.en!.id, x]));
    expect(byEn["1"]!.items.es!.id).toBe("4");
    expect(byEn["1"]!.match).toBe("shared-image");
    expect(byEn["2"]!.items.es!.id).toBe("3");
  });

  it("matches unambiguous entries a few days apart with the same categories", () => {
    const g = pairEntries([
      src("en", [entry("1", "2025-02-10T09:00:00Z")]),
      src("es", [entry("2", "2025-02-13T09:00:00Z")]),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0]!.match).toBe("adjacent-day");
    const far = pairEntries([
      src("en", [entry("1", "2025-02-01T09:00:00Z")]),
      src("es", [entry("2", "2025-02-13T09:00:00Z")]),
    ]);
    expect(far).toHaveLength(2);
  });

  it("keeps unmatched entries as single-language posts and honours overrides", () => {
    const en = [entry("1", "2024-01-01T09:00:00Z"), entry("5", "2024-06-01T09:00:00Z")];
    const es = [entry("2", "2024-01-01T09:00:00Z"), entry("6", "2024-09-01T09:00:00Z")];
    const auto = pairEntries([src("en", en), src("es", es)]);
    expect(auto).toHaveLength(3);
    const manual = pairEntries([src("en", en), src("es", es)], {
      pairs: [["5", "6"]],
      unpair: ["1"],
    });
    const byEn = Object.fromEntries(
      manual.filter((x) => x.items.en).map((x) => [x.items.en!.id, x]),
    );
    expect(byEn["5"]!.items.es!.id).toBe("6");
    expect(byEn["5"]!.match).toBe("manual");
    expect(byEn["1"]!.items.es).toBeUndefined();
    // {en 1} unpaired, {en 5 + es 6} manual, {es 2} left alone
    expect(manual).toHaveLength(3);
  });
});

describe("importHeadway (integration)", () => {
  let t: { db: import("@featherlog/db").Db; close: () => Promise<void> };
  let wsSlug: string;

  const page = (
    account: string,
    items: { id: string; title: string; date: string; body: string; img?: string }[],
  ) =>
    `<html><body>${items
      .map(
        (
          i,
        ) => `<div class="changelogItem published"><h2 class="title"><a href="/${account}/slug-${i.id}">${i.title}</a></h2>
<div class="content"><span class="beforeCategories">&nbsp;</span><h3 class='category category_1'>New</h3>&nbsp;<span class="afterCategories">&nbsp;</span>
${i.img ? `<p><img src="${i.img}" alt="shot"/></p>` : ""}<p>${i.body}</p></div>
<div class="articleMeta"><time datetime="${i.date}"></time></div></div>`,
      )
      .join("\n")}</body></html>`;

  const pages: Record<string, string> = {
    "https://headwayapp.co/acme-en": page("acme-en", [
      {
        id: "11",
        title: "Dark mode",
        date: "2025-01-10T09:00:00Z",
        body: "Switch themes.",
        img: "https://cloud.headwayapp.co/i/big/a.png",
      },
      { id: "12", title: "Only in English", date: "2025-02-01T09:00:00Z", body: "EN only." },
    ]),
    "https://headwayapp.co/acme-es": page("acme-es", [
      {
        id: "21",
        title: "Modo oscuro",
        date: "2025-01-10T09:00:00Z",
        body: "Cambia de tema.",
        img: "https://cloud.headwayapp.co/i/big/b.png",
      },
    ]),
  };
  const fakeFetch = (async (url: string) =>
    pages[url]
      ? new Response(pages[url], { status: 200 })
      : new Response("nope", { status: 404 })) as unknown as typeof fetch;

  beforeAll(async () => {
    const { createTestDb } = await import("@featherlog/db/testing");
    t = await createTestDb();
    const { schema } = await import("@featherlog/db");
    const { createWorkspace, updateWorkspace } = await import("@featherlog/core");
    await t.db
      .insert(schema.user)
      .values({ id: "u1", name: "Owner", email: "owner@example.com", emailVerified: true });
    const ws = await createWorkspace(t.db, "u1", { name: "Acme" });
    await updateWorkspace(
      {
        db: t.db,
        workspaceId: ws.id,
        actor: { kind: "user", userId: "u1", role: "owner" },
        via: "panel",
      },
      { locales: ["en", "es"] },
    );
    wsSlug = ws.slug;
  });
  afterAll(() => t.close());

  it("previews, imports pairs as translations with re-hosted images, and is idempotent", async () => {
    const { importHeadway } = await import("../src/server/import/run");
    const sharp = (await import("sharp")).default;
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#3778ff" } })
      .png()
      .toBuffer();
    const base = {
      db: t.db,
      workspace: wsSlug,
      sources: [
        { account: "acme-en", locale: "en" },
        { account: "acme-es", locale: "es" },
      ],
      fetch: fakeFetch,
      delayMs: 0,
      downloadImage: async () => ({ bytes: png, mime: "image/png" }),
    };

    const dry = await importHeadway({ ...base, dryRun: true });
    expect(dry.groups).toBe(2);
    expect(dry.created).toBe(0);
    expect(dry.report).toContain("Dark mode");

    const first = await importHeadway(base);
    expect(first).toMatchObject({ created: 2, skipped: 0, images: 2 });

    const { listPosts } = await import("@featherlog/core");
    const { findWorkspaceBySlug } = await import("@featherlog/core");
    const ws = (await findWorkspaceBySlug(t.db, wsSlug))!.workspace;
    const ctx = {
      db: t.db,
      workspaceId: ws.id,
      actor: { kind: "user" as const, userId: "u1", role: "owner" as const },
      via: "panel" as const,
    };
    const { items } = await listPosts(ctx, { limit: 10 });
    const dark = items.find((p) => p.translations.en?.title === "Dark mode")!;
    expect(dark.status).toBe("published");
    expect(dark.author).toBeNull();
    expect(dark.publishedAt?.toISOString()).toBe("2025-01-10T09:00:00.000Z");
    expect(dark.translations.es?.title).toBe("Modo oscuro");
    expect(dark.translations.en?.contentMd).toMatch(
      /^\[New\]\n\n!\[shot\]\(http:\/\/localhost:3100\/uploads\/images\//,
    );
    expect(dark.categoryIds).toHaveLength(1);
    expect(
      items.find((p) => p.translations.en?.title === "Only in English")?.translations.es,
    ).toBeUndefined();

    const again = await importHeadway(base);
    expect(again).toMatchObject({ created: 0, skipped: 2, images: 0 });
  });

  it("adds extra translations (with re-hosted images) to imported posts, once", async () => {
    const { importHeadway } = await import("../src/server/import/run");
    const sharp = (await import("sharp")).default;
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#ff0000" } })
      .png()
      .toBuffer();
    const extra = [
      {
        externalId: "12",
        locale: "es",
        title: "Solo en inglés (traducida)",
        contentMd: "[New]\n\n![shot](https://cloud.headwayapp.co/i/big/extra.png)\n\nTraducción.",
      },
    ];
    const base = {
      db: t.db,
      workspace: wsSlug,
      sources: [
        { account: "acme-en", locale: "en" },
        { account: "acme-es", locale: "es" },
      ],
      fetch: fakeFetch,
      delayMs: 0,
      downloadImage: async () => ({ bytes: png, mime: "image/png" }),
      extraTranslations: extra,
    };
    const res = await importHeadway(base);
    expect(res).toMatchObject({ created: 0, translationsAdded: 1, images: 1 });
    const { findWorkspaceBySlug, listPosts } = await import("@featherlog/core");
    const ws = (await findWorkspaceBySlug(t.db, wsSlug))!.workspace;
    const ctx = {
      db: t.db,
      workspaceId: ws.id,
      actor: { kind: "user" as const, userId: "u1", role: "owner" as const },
      via: "panel" as const,
    };
    const post = (await listPosts(ctx, { limit: 10 })).items.find(
      (p) => p.translations.en?.title === "Only in English",
    )!;
    expect(post.translations.es?.title).toBe("Solo en inglés (traducida)");
    expect(post.translations.es?.contentMd).toContain("http://localhost:3100/uploads/images/");
    expect(post.translations.es?.contentMd).not.toContain("cloud.headwayapp.co");
    const again = await importHeadway(base);
    expect(again).toMatchObject({ created: 0, translationsAdded: 0, images: 0 });
  });

  it("refuses workspaces without the needed languages", async () => {
    const { importHeadway } = await import("../src/server/import/run");
    await expect(
      importHeadway({
        db: t.db,
        workspace: wsSlug,
        sources: [{ account: "acme-en", locale: "fr" }],
        fetch: fakeFetch,
        delayMs: 0,
      }),
    ).rejects.toThrow(/fr/);
  });
});

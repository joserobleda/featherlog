import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCategory, getCategory, updateCategory } from "../src/categories";
import { getPublicFeed, getPublicPost } from "../src/feed";
import { createPost, getPost, rerenderWorkspacePosts, setTranslation } from "../src/posts";
import { setup, workspaceFixture } from "./helpers";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  t = await setup();
});
afterAll(() => t.close());

describe("categories", () => {
  it("removes a locale's name with null but keeps at least one name", async () => {
    const f = await workspaceFixture(t.db, { locales: ["en", "es"] });
    const cat = await createCategory(f.owner, {
      color: "#112233",
      names: { en: "Feature", es: "Función" },
    });
    const updated = await updateCategory(f.owner, cat.id, { names: { es: null } });
    expect(updated.names).toEqual({ en: "Feature" });
    expect(updated.slugs).toEqual({ en: "feature" });
    await expect(updateCategory(f.owner, cat.id, { names: { en: null } })).rejects.toMatchObject({
      code: "validation",
    });
    // Replacing the only name in one call is fine.
    const swapped = await updateCategory(f.owner, cat.id, {
      names: { en: null, es: "Función" },
    });
    expect(swapped.names).toEqual({ es: "Función" });
    // Removing a locale that has no name is a no-op.
    expect((await updateCategory(f.owner, cat.id, { names: { fr: null } })).names).toEqual({
      es: "Función",
    });
    expect((await getCategory(t.db, f.ws.id, cat.id)).names).toEqual({ es: "Función" });
  });

  it("reports name clashes with the field path and locale", async () => {
    const f = await workspaceFixture(t.db, { locales: ["en", "es"] });
    await createCategory(f.owner, { color: "#112233", names: { en: "Feature", es: "Función" } });
    const other = await createCategory(f.owner, { color: "#445566", names: { en: "Other" } });
    await expect(
      updateCategory(f.owner, other.id, { names: { es: "función" } }),
    ).rejects.toMatchObject({
      code: "conflict",
      details: { field: "names.es", locale: "es" },
    });
    await expect(
      createCategory(f.owner, { color: "#445566", names: { en: "FEATURE" } }),
    ).rejects.toMatchObject({ code: "conflict", details: { field: "names.en", locale: "en" } });
    // Renaming a category to its own name (different case) is not a clash.
    const own = await updateCategory(f.owner, other.id, { names: { en: "OTHER" } });
    expect(own.names.en).toBe("OTHER");
  });

  it("matches markers in any locale and shows the chip in the translation's locale", async () => {
    const f = await workspaceFixture(t.db, { locales: ["en", "es", "fr"] });
    const feat = await createCategory(f.owner, {
      color: "#112233",
      names: { en: "Feature", es: "Función", fr: "Fonction" },
    });
    const post = await createPost(f.owner, {
      translations: {
        en: { title: "Hello", contentMd: "[Función]\n\nHi" },
        es: { title: "Hola", contentMd: "[feature]\n\nHola" },
        fr: { title: "Salut", contentMd: "[Función]\n\nSalut" },
      },
    });
    expect(post.categoryIds).toEqual([feat.id]);
    expect(post.translations.en?.contentHtml).toContain(">Feature</span>");
    expect(post.translations.es?.contentHtml).toContain(">Función</span>");
    expect(post.translations.fr?.contentHtml).toContain(">Fonction</span>");
    expect(post.translations.es?.contentHtml).not.toContain("[feature]");
  });

  it("prefers own-locale names, then default-locale names, then other locales", async () => {
    const f = await workspaceFixture(t.db, { locales: ["en", "es", "fr"] });
    // "Mix" is A's French name, B's English (default) name and C's Spanish name.
    const a = await createCategory(f.owner, {
      color: "#111111",
      names: { en: "Alpha", fr: "Mix" },
    });
    const b = await createCategory(f.owner, { color: "#222222", names: { en: "Mix" } });
    const c = await createCategory(f.owner, {
      color: "#333333",
      names: { en: "Gamma", es: "Mix" },
    });
    const p = await createPost(f.owner, {
      translations: {
        es: { title: "es", contentMd: "[Mix]" },
        fr: { title: "fr", contentMd: "[Mix]" },
        en: { title: "en", contentMd: "[Alpha]" },
      },
    });
    // es: own name wins (C); fr: own name wins (A); en: A by its English name.
    expect(p.translations.es?.contentHtml).toContain(`data-category-id="${c.id}"`);
    expect(p.translations.fr?.contentHtml).toContain(`data-category-id="${a.id}"`);
    expect(p.categoryIds.sort()).toEqual([a.id, c.id].sort());

    // No German names: the default-locale (English) name wins over other locales.
    const ws = await (await import("../src/workspaces")).updateWorkspace(f.owner, {
      locales: ["en", "es", "fr", "de"],
    });
    expect(ws.locales).toContain("de");
    const q = await createPost(f.owner, {
      translations: { de: { title: "de", contentMd: "[mix]" } },
    });
    expect(q.categoryIds).toEqual([b.id]);
    expect(q.translations.de?.contentHtml).toContain(">Mix</span>");
  });

  it("re-renders stored HTML after renaming a category", async () => {
    const f = await workspaceFixture(t.db, { locales: ["en", "es"] });
    const cat = await createCategory(f.owner, { color: "#112233", names: { en: "Feature" } });
    const p = await createPost(f.owner, {
      translations: { en: { title: "Hi", contentMd: "[Feature]\n\nbody" } },
    });
    await setTranslation(f.owner, p.id, "es", { title: "Hola", contentMd: "[Feature]\n\ncuerpo" });
    expect((await getPost(f.owner, p.id)).translations.es?.contentHtml).toContain(
      ">Feature</span>",
    );

    await updateCategory(f.owner, cat.id, { names: { en: "Highlight", es: "Novedad" } });
    await rerenderWorkspacePosts(t.db, f.ws.id);
    const after = await getPost(f.owner, p.id);
    // The old name is gone, so the markers no longer match and the category is dropped.
    expect(after.translations.en?.contentHtml).toBe("<p>[Feature]</p>\n<p>body</p>");
    expect(after.categoryIds).toEqual([]);

    await updateCategory(f.owner, cat.id, { names: { en: "Feature" } });
    await rerenderWorkspacePosts(t.db, f.ws.id);
    const restored = await getPost(f.owner, p.id);
    expect(restored.categoryIds).toEqual([cat.id]);
    expect(restored.translations.en?.contentHtml).toContain(">Feature</span>");
    expect(restored.translations.es?.contentHtml).toContain(">Novedad</span>");

    await updateCategory(f.owner, cat.id, { color: "#AA0000" });
    await rerenderWorkspacePosts(t.db, f.ws.id);
    expect((await getPost(f.owner, p.id)).translations.en?.contentHtml).toContain(
      "--fl-cat:#AA0000",
    );
  });

  it("names fallback posts' categories in the requested locale", async () => {
    const f = await workspaceFixture(t.db, { locales: ["en", "es", "fr"] });
    const cat = await createCategory(f.owner, {
      color: "#112233",
      names: { en: "Feature", es: "Función" },
    });
    const p = await createPost(f.owner, {
      translations: { en: { title: "English only", contentMd: "[Feature]\n\nbody" } },
      publish: true,
    });
    const es = await getPublicFeed(t.db, f.ws, { locale: "es" });
    expect(es.items[0]).toMatchObject({ isFallback: true, locale: "en" });
    expect(es.items[0]?.categories).toEqual([
      { id: cat.id, name: "Función", slug: "funcion", color: "#112233" },
    ]);
    // A locale without a category name falls back to the default-locale name.
    const fr = await getPublicPost(t.db, f.ws, p.publicId, "fr");
    expect(fr?.categories[0]).toMatchObject({ name: "Feature", slug: "feature" });
    const en = await getPublicFeed(t.db, f.ws, { locale: "en" });
    expect(en.items[0]?.categories[0]).toMatchObject({ name: "Feature", slug: "feature" });
  });
});

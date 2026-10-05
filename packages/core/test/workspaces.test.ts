import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listCategories } from "../src/categories";
import { getWidgetSettings } from "../src/widget";
import {
  createWorkspace,
  findWorkspaceBySlug,
  getMembershipRole,
  isSlugAvailable,
  listUserWorkspaces,
  updateWorkspace,
} from "../src/workspaces";
import { createUser, setup, workspaceFixture } from "./helpers";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  t = await setup();
});
afterAll(() => t.close());

describe("workspaces", () => {
  it("creates a workspace with owner, default categories and widget settings", async () => {
    const uid = await createUser(t.db);
    const ws = await createWorkspace(t.db, uid, { name: "Nailted", defaultLocale: "es" });
    expect(ws.slug).toBe("nailted");
    expect(ws.publicId).toHaveLength(8);
    expect(ws.locales).toEqual(["es"]);
    expect(await getMembershipRole(t.db, ws.id, uid)).toBe("owner");
    const cats = await listCategories(t.db, ws.id);
    expect(cats.map((c) => c.names.es)).toEqual(["Nuevo", "Mejora", "Corrección"]);
    expect((await getWidgetSettings(t.db, ws.id)).entriesLimit).toBe(5);
    expect((await listUserWorkspaces(t.db, uid)).map((x) => x.role)).toEqual(["owner"]);
  });

  it("generates unique slugs and rejects reserved or taken ones", async () => {
    const uid = await createUser(t.db);
    const a = await createWorkspace(t.db, uid, { name: "Same Name" });
    const b = await createWorkspace(t.db, uid, { name: "Same Name" });
    expect(a.slug).toBe("same-name");
    expect(b.slug).toBe("same-name-2");
    expect(await isSlugAvailable(t.db, "api")).toBe(false);
    await expect(createWorkspace(t.db, uid, { name: "X", slug: "same-name" })).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("keeps old slugs as redirects after renaming", async () => {
    const f = await workspaceFixture(t.db);
    const old = f.ws.slug;
    await updateWorkspace(f.owner, { slug: "acme-renamed" });
    const found = await findWorkspaceBySlug(t.db, old);
    expect(found?.workspace.slug).toBe("acme-renamed");
    expect(found?.redirectedFrom).toBe(old);
    expect(await isSlugAvailable(t.db, old)).toBe(false);
  });

  it("always keeps the default locale among enabled locales", async () => {
    const f = await workspaceFixture(t.db);
    const ws = await updateWorkspace(f.owner, { defaultLocale: "es", locales: ["fr"] });
    expect(ws.defaultLocale).toBe("es");
    expect(ws.locales).toEqual(["es", "fr"]);
  });

  it("forbids editors from changing settings", async () => {
    const f = await workspaceFixture(t.db);
    const editor = f.userCtx(await createUser(t.db), "editor");
    await expect(updateWorkspace(editor, { name: "Nope" })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("validates input", async () => {
    const f = await workspaceFixture(t.db);
    await expect(updateWorkspace(f.owner, { accentColor: "red" })).rejects.toThrow();
    await expect(updateWorkspace(f.owner, { locales: ["xx"] })).rejects.toThrow();
  });
});

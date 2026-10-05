/**
 * Dev fixture for the public changelog / widget / RSS.
 *
 *   cd apps/web && npx tsx --env-file=.env.local scripts/dev-public-fixture.ts
 *
 * (Re)creates two workspaces:
 *   - `fixture-demo` (was `fixture-demo-old`, so the old slug redirects), locales en+es, 4 posts
 *   - `fixture-private` in private mode
 * and prints their public ids. Safe to re-run: it deletes and recreates them.
 */
import {
  type Ctx,
  createPost,
  createWorkspace,
  deleteWorkspace,
  findWorkspaceBySlug,
  listCategories,
  updateCategory,
  updateWorkspace,
} from "@featherlog/core";
import { createDb, user } from "@featherlog/db";
import { eq } from "drizzle-orm";

const { db, close } = createDb(
  process.env.DATABASE_URL ?? "postgres://featherlog:featherlog@localhost:5442/featherlog",
);

const USER = {
  id: "fixture-user-0000000",
  name: "Ada Fixture",
  email: "ada.fixture@example.test",
  jobTitle: "Product Manager",
};

async function ensureUser() {
  const [u] = await db.select().from(user).where(eq(user.id, USER.id));
  if (!u) await db.insert(user).values({ ...USER, emailVerified: true });
}

function ctxFor(workspaceId: string): Ctx {
  return { db, workspaceId, actor: { kind: "user", userId: USER.id, role: "owner" }, via: "panel" };
}

async function reset(slug: string) {
  const found = await findWorkspaceBySlug(db, slug);
  if (found) await deleteWorkspace(ctxFor(found.workspace.id));
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

async function main() {
  await ensureUser();
  for (const s of ["fixture-demo", "fixture-demo-old", "fixture-private"]) await reset(s);

  // Public, bilingual workspace (created with an old slug, then renamed → redirect).
  const created = await createWorkspace(db, USER.id, {
    name: "Fixture Demo",
    slug: "fixture-demo-old",
    websiteUrl: "https://example.com",
  });
  const ctx = ctxFor(created.id);
  const ws = await updateWorkspace(ctx, {
    slug: "fixture-demo",
    locales: ["en", "es"],
    accentColor: "#E8590C",
    terminology: "changelog",
  });
  const cats = await listCategories(db, ws.id);
  const es: Record<string, string> = { New: "Nuevo", Improvement: "Mejora", Fix: "Corrección" };
  for (const c of cats) {
    const name = c.names.en;
    if (name && es[name]) await updateCategory(ctx, c.id, { names: { es: es[name] } });
  }

  await createPost(ctx, {
    publish: true,
    publishedAt: daysAgo(20),
    translations: {
      en: { title: "Hello, Featherlog", contentMd: "[New]\n\nOur changelog is live. **Welcome!**" },
      es: {
        title: "Hola, Featherlog",
        contentMd: "[Nuevo]\n\nNuestro registro de cambios ya está en marcha. **¡Bienvenidos!**",
      },
    },
  });
  await createPost(ctx, {
    publish: true,
    publishedAt: daysAgo(10),
    translations: {
      en: {
        title: "Dark mode & faster search",
        contentMd: [
          "[New] [Improvement]",
          "",
          "You can now switch to **dark mode**.",
          "",
          "![Screenshot](https://placehold.co/1200x600/png)",
          "",
          "- Search is 3× faster",
          "- New keyboard shortcuts",
          "",
          "```ts\nconst x: number = 42;\n```",
        ].join("\n"),
      },
      es: {
        title: "Modo oscuro y búsqueda más rápida",
        contentMd: [
          "[Nuevo] [Mejora]",
          "",
          "Ya puedes activar el **modo oscuro**.",
          "",
          "![Captura](https://placehold.co/1200x600/png)",
          "",
          "- La búsqueda es 3× más rápida",
        ].join("\n"),
      },
    },
  });
  await createPost(ctx, {
    publish: true,
    publishedAt: daysAgo(3),
    translations: {
      en: {
        title: "Product tour video",
        contentMd:
          "[Improvement]\n\nWatch the tour:\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ\n",
      },
    },
  });
  await createPost(ctx, {
    publish: true,
    publishedAt: daysAgo(1),
    translations: {
      en: {
        title: "Fixed login loop <script>",
        contentMd: '[Fix]\n\nNo more redirect loops & weird "quotes".',
      },
    },
  });
  // A draft must never show up publicly.
  await createPost(ctx, { translations: { en: { title: "Secret draft", contentMd: "Not yet" } } });

  // Private workspace.
  const priv = await createWorkspace(db, USER.id, {
    name: "Fixture Private",
    slug: "fixture-private",
  });
  await updateWorkspace(ctxFor(priv.id), { privateMode: true });
  await createPost(ctxFor(priv.id), {
    publish: true,
    translations: {
      en: { title: "Internal release 1.2", contentMd: "[New]\n\nFor the team only." },
    },
  });

  console.log(
    JSON.stringify({
      demo: { slug: ws.slug, publicId: ws.publicId, id: ws.id },
      private: { slug: priv.slug, publicId: priv.publicId, id: priv.id },
    }),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => close());

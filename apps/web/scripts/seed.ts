// Demo data for local development and screenshots:  pnpm db:seed
// Creates (or recreates) the "acme" workspace owned by a demo user. DEVELOPMENT ONLY.
//   SEED_EMAIL / SEED_PASSWORD override the demo credentials.
import {
  createApiKey,
  createCategory,
  createPost,
  createWorkspace,
  type Ctx,
  findWorkspaceBySlug,
  listCategories,
  updateCategory,
  updateWidgetSettings,
  updateWorkspace,
} from "@featherlog/core";
import { createDb, schema } from "@featherlog/db";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

const EMAIL = process.env.SEED_EMAIL ?? "demo@featherlog.test";
const PASSWORD = process.env.SEED_PASSWORD ?? "featherlog-demo-123";
const SLUG = process.env.SEED_SLUG ?? "acme";
const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://featherlog:featherlog@localhost:5442/featherlog";

export async function seed(opts: { email?: string; password?: string; slug?: string; databaseUrl?: string; quiet?: boolean } = {}) {
  const email = opts.email ?? EMAIL;
  const password = opts.password ?? PASSWORD;
  const slug = opts.slug ?? SLUG;
  const { db, close } = createDb(opts.databaseUrl ?? DATABASE_URL);
  try {
    // User with email + password credentials (the same rows Better Auth writes on sign-up).
    let [user] = await db.select().from(schema.user).where(eq(schema.user.email, email));
    if (!user) {
      [user] = await db
        .insert(schema.user)
        .values({ id: nanoid(32), name: "Ada Lovelace", displayName: "Ada from Acme", jobTitle: "Product Manager", email, emailVerified: true })
        .returning();
      await db.insert(schema.account).values({
        id: nanoid(32),
        accountId: user!.id,
        providerId: "credential",
        userId: user!.id,
        password: await hashPassword(password),
      });
    }
    const userId = user!.id;

    const existing = await findWorkspaceBySlug(db, slug);
    if (existing) await db.delete(schema.workspaces).where(eq(schema.workspaces.id, existing.workspace.id));

    const ws = await createWorkspace(db, userId, { name: "Acme", slug, defaultLocale: "en", websiteUrl: "https://acme.example" });
    const ctx: Ctx = { db, workspaceId: ws.id, actor: { kind: "user", userId, role: "owner" }, via: "panel" };
    await updateWorkspace(ctx, { locales: ["en", "es"], accentColor: "#5B5BD6" });

    // Spanish names for the default categories + an extra one.
    const cats = await listCategories(db, ws.id);
    const es: Record<string, string> = { New: "Nuevo", Improvement: "Mejora", Fix: "Corrección" };
    for (const c of cats) if (c.names.en && es[c.names.en]) await updateCategory(ctx, c.id, { names: { es: es[c.names.en]! } });
    await createCategory(ctx, { color: "#0F9D58", names: { en: "Security", es: "Seguridad" } });

    const day = 86_400_000;
    const posts: { at: number; publish?: boolean; en: [string, string]; es?: [string, string] }[] = [
      {
        at: -40,
        en: ["Welcome to the Acme changelog", "[New]\n\nThis is where we announce **everything new** in Acme. Subscribe with RSS or keep an eye on the 🔔 in the app."],
        es: ["Bienvenida al changelog de Acme", "[Nuevo]\n\nAquí anunciamos **todo lo nuevo** de Acme. Suscríbete por RSS o vigila la 🔔 de la aplicación."],
      },
      {
        at: -21,
        en: ["Dark mode 🌙", "[New]\n\nYou can now switch to a **dark theme** from *Settings → Appearance*. It follows your system preference by default.\n\n- Easier on the eyes at night\n- Better contrast for charts"],
        es: ["Modo oscuro 🌙", "[Nuevo]\n\nYa puedes cambiar a un **tema oscuro** desde *Ajustes → Apariencia*. Por defecto sigue la preferencia del sistema.\n\n- Descansa la vista por la noche\n- Mejor contraste en los gráficos"],
      },
      {
        at: -12,
        en: ["Faster search", "[Improvement]\n\nSearch results now appear **3× faster**, and you can filter by date range.\n\n```ts\nconst results = await acme.search({ q: \"invoice\", from: \"2026-01-01\" });\n```"],
        es: ["Búsqueda más rápida", "[Mejora]\n\nLos resultados aparecen **3 veces más rápido** y ya puedes filtrar por fechas.\n\n```ts\nconst results = await acme.search({ q: \"invoice\", from: \"2026-01-01\" });\n```"],
      },
      {
        at: -7,
        en: ["Two-factor authentication", "[Security] [New]\n\nProtect your account with an authenticator app. Admins can require 2FA for the whole team.\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ"],
      },
      {
        at: -3,
        en: ["Export fixes", "[Fix]\n\n- CSV exports keep accents and emoji intact\n- PDF exports no longer cut the last row"],
        es: ["Correcciones en la exportación", "[Corrección]\n\n- Las exportaciones CSV conservan tildes y emoji\n- Los PDF ya no cortan la última fila"],
      },
      {
        at: 5,
        en: ["Public API v2", "[New]\n\nScheduled announcement: a brand-new API with webhooks."],
        es: ["API pública v2", "[Nuevo]\n\nAnuncio programado: una API nueva con webhooks."],
      },
      {
        at: 0,
        publish: false,
        en: ["Draft: mobile app", "[New]\n\nWork in progress — not visible yet."],
      },
    ];
    for (const p of posts) {
      const translations: Record<string, { title: string; contentMd: string }> = { en: { title: p.en[0], contentMd: p.en[1] } };
      if (p.es) translations.es = { title: p.es[0], contentMd: p.es[1] };
      await createPost(ctx, { translations, publish: p.publish ?? true, publishedAt: new Date(Date.now() + p.at * day) });
    }
    await updateWidgetSettings(ctx, { eyecatcher: "on", badgeDelay: 0, entriesLimit: 5 });
    const { secret } = await createApiKey(ctx, { name: "Demo key", scopes: ["posts:read", "posts:write", "posts:publish", "categories:write", "assets:write"] });

    if (!opts.quiet) {
      console.log(`Seeded workspace "${ws.slug}" (widget account ${ws.publicId})`);
      console.log(`  Sign in:  ${email} / ${password === PASSWORD ? "(SEED_PASSWORD or the default in scripts/seed.ts)" : "(your SEED_PASSWORD)"}`);
      console.log(`  API key:  ${secret}`);
    }
    return { workspaceId: ws.id, slug: ws.slug, publicId: ws.publicId, userId, email, apiKey: secret };
  } finally {
    await close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await seed();
}

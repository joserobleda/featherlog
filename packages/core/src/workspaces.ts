import {
  categories,
  categoryTranslations,
  type Db,
  type DbOrTx,
  memberships,
  slugRedirects,
  widgetSettings,
  workspaces,
} from "@featherlog/db";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { assertCan, type Ctx, type Role } from "./auth";
import { DEFAULT_CATEGORIES, RESERVED_SLUGS, TERMINOLOGY } from "./defaults";
import { AppError, notFound } from "./errors";
import { emit } from "./events";
import { newId, newWorkspacePublicId, slugify } from "./ids";
import { isLocale } from "./locales";

export type Workspace = typeof workspaces.$inferSelect;

const slugSchema = z
  .string()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Use lowercase letters, numbers and dashes");

const localeSchema = z.string().refine(isLocale, "Unsupported locale");
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #3778FF");

export const CreateWorkspaceInput = z.object({
  name: z.string().trim().min(1).max(80),
  slug: slugSchema.optional(),
  defaultLocale: localeSchema.default("en"),
  websiteUrl: z
    .url()
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export const UpdateWorkspaceInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    slug: slugSchema,
    logoUrl: z.string().max(2048).nullable(),
    websiteUrl: z
      .url()
      .nullable()
      .or(z.literal("").transform(() => null)),
    accentColor: colorSchema,
    terminology: z.enum(TERMINOLOGY),
    whitelabel: z.boolean(),
    showAuthors: z.boolean(),
    noindex: z.boolean(),
    privateMode: z.boolean(),
    defaultLocale: localeSchema,
    locales: z.array(localeSchema).min(1).max(15),
    missingTranslation: z.enum(["fallback", "hide"]),
    integrationsCanPublish: z.boolean(),
  })
  .partial();

export async function isSlugAvailable(db: DbOrTx, slug: string, exceptWorkspaceId?: string) {
  if (RESERVED_SLUGS.has(slug)) return false;
  const [ws] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.slug, slug));
  if (ws && ws.id !== exceptWorkspaceId) return false;
  const [redirect] = await db
    .select({ workspaceId: slugRedirects.workspaceId })
    .from(slugRedirects)
    .where(eq(slugRedirects.oldSlug, slug));
  return !redirect || redirect.workspaceId === exceptWorkspaceId;
}

async function uniqueSlug(db: DbOrTx, base: string) {
  const root = slugify(base, 40);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    if (await isSlugAvailable(db, candidate)) return candidate;
  }
  return `${root}-${newId().slice(0, 6)}`;
}

/** Creates a workspace owned by `userId`, with default categories and widget settings. */
export async function createWorkspace(
  db: Db,
  userId: string,
  rawInput: z.input<typeof CreateWorkspaceInput>,
) {
  const input = CreateWorkspaceInput.parse(rawInput);
  return db.transaction(async (tx) => {
    let slug = input.slug;
    if (slug) {
      if (!(await isSlugAvailable(tx, slug)))
        throw new AppError("conflict", "This URL is already taken", { field: "slug" });
    } else {
      slug = await uniqueSlug(tx, input.name);
    }
    const id = newId();
    const [ws] = await tx
      .insert(workspaces)
      .values({
        id,
        publicId: newWorkspacePublicId(),
        slug,
        name: input.name,
        websiteUrl: input.websiteUrl ?? null,
        defaultLocale: input.defaultLocale,
        locales: [input.defaultLocale],
      })
      .returning();
    await tx.insert(memberships).values({ workspaceId: id, userId, role: "owner" });
    await tx.insert(widgetSettings).values({ workspaceId: id });
    let position = 0;
    for (const def of DEFAULT_CATEGORIES) {
      const categoryId = newId();
      await tx
        .insert(categories)
        .values({ id: categoryId, workspaceId: id, color: def.color, position: position++ });
      const name = def.names[input.defaultLocale] ?? def.names.en!;
      await tx.insert(categoryTranslations).values({
        categoryId,
        locale: input.defaultLocale,
        name,
        slug: slugify(name),
      });
    }
    return ws!;
  });
}

export async function getWorkspace(db: DbOrTx, id: string) {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id));
  if (!ws) throw notFound("Workspace");
  return ws;
}

export async function findWorkspaceBySlug(db: DbOrTx, slug: string) {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.slug, slug));
  if (ws) return { workspace: ws, redirectedFrom: null as string | null };
  const [redirect] = await db
    .select({ ws: workspaces })
    .from(slugRedirects)
    .innerJoin(workspaces, eq(workspaces.id, slugRedirects.workspaceId))
    .where(eq(slugRedirects.oldSlug, slug));
  return redirect ? { workspace: redirect.ws, redirectedFrom: slug } : null;
}

export async function findWorkspaceByPublicId(db: DbOrTx, publicId: string) {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.publicId, publicId));
  return ws ?? null;
}

export async function findWorkspaceByDomain(db: DbOrTx, domain: string) {
  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.customDomain, domain.toLowerCase()));
  return ws ?? null;
}

export async function listUserWorkspaces(db: DbOrTx, userId: string) {
  return db
    .select({ workspace: workspaces, role: memberships.role })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(workspaces.name));
}

export async function getMembershipRole(
  db: DbOrTx,
  workspaceId: string,
  userId: string,
): Promise<Role | null> {
  const [m] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)));
  return (m?.role as Role | undefined) ?? null;
}

export async function updateWorkspace(ctx: Ctx, rawInput: z.input<typeof UpdateWorkspaceInput>) {
  assertCan(ctx, "settings:write");
  const input = UpdateWorkspaceInput.parse(rawInput);
  const current = await getWorkspace(ctx.db, ctx.workspaceId);

  if (input.locales || input.defaultLocale) {
    const locales = [...new Set(input.locales ?? current.locales)];
    const defaultLocale = input.defaultLocale ?? current.defaultLocale;
    if (!locales.includes(defaultLocale)) locales.unshift(defaultLocale);
    input.locales = locales;
    input.defaultLocale = defaultLocale;
  }

  if (input.slug && input.slug !== current.slug) {
    if (!(await isSlugAvailable(ctx.db, input.slug, current.id))) {
      throw new AppError("conflict", "This URL is already taken", { field: "slug" });
    }
    // Keep old public URLs working.
    await ctx.db.delete(slugRedirects).where(eq(slugRedirects.oldSlug, input.slug));
    await ctx.db
      .insert(slugRedirects)
      .values({ oldSlug: current.slug, workspaceId: current.id })
      .onConflictDoNothing();
  }

  const [ws] = await ctx.db
    .update(workspaces)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(workspaces.id, ctx.workspaceId))
    .returning();
  await emit(ctx.db, ctx.workspaceId, "workspace.updated", { fields: Object.keys(input) });
  return ws!;
}

export async function deleteWorkspace(ctx: Ctx) {
  assertCan(ctx, "workspace:delete");
  await ctx.db.delete(workspaces).where(eq(workspaces.id, ctx.workspaceId));
}

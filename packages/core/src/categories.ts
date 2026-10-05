import { categories, categoryTranslations, type DbOrTx } from "@featherlog/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { assertCan, type Ctx } from "./auth";
import { AppError, notFound } from "./errors";
import { newId, slugify } from "./ids";
import { isLocale } from "./locales";

export type Category = {
  id: string;
  color: string;
  position: number;
  /** Names per locale. */
  names: Record<string, string>;
  slugs: Record<string, string>;
};

const names = z
  .record(z.string(), z.string().trim().min(1).max(40))
  .refine((r) => Object.keys(r).every(isLocale), "Unsupported locale")
  .refine((r) => Object.keys(r).length > 0, "At least one name is required");

export const CreateCategoryInput = z.object({
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  names,
});
export const UpdateCategoryInput = z.object({
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  names: names.optional(),
});

export async function listCategories(db: DbOrTx, workspaceId: string): Promise<Category[]> {
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.workspaceId, workspaceId))
    .orderBy(asc(categories.position), asc(categories.createdAt));
  if (rows.length === 0) return [];
  const translations = await db
    .select()
    .from(categoryTranslations)
    .where(
      inArray(
        categoryTranslations.categoryId,
        rows.map((r) => r.id),
      ),
    );
  return rows.map((r) => {
    const t = translations.filter((x) => x.categoryId === r.id);
    return {
      id: r.id,
      color: r.color,
      position: r.position,
      names: Object.fromEntries(t.map((x) => [x.locale, x.name])),
      slugs: Object.fromEntries(t.map((x) => [x.locale, x.slug])),
    };
  });
}

/** Category name in `locale`, falling back to `fallback` locale and then any name. */
export function categoryName(cat: Pick<Category, "names">, locale: string, fallback: string) {
  return cat.names[locale] ?? cat.names[fallback] ?? Object.values(cat.names)[0] ?? "";
}

export function categorySlug(cat: Pick<Category, "slugs" | "names">, locale: string, fallback: string) {
  return cat.slugs[locale] ?? cat.slugs[fallback] ?? slugify(categoryName(cat, locale, fallback));
}

async function writeNames(db: DbOrTx, categoryId: string, input: Record<string, string>) {
  for (const [locale, name] of Object.entries(input)) {
    await db
      .insert(categoryTranslations)
      .values({ categoryId, locale, name, slug: slugify(name) })
      .onConflictDoUpdate({
        target: [categoryTranslations.categoryId, categoryTranslations.locale],
        set: { name, slug: slugify(name) },
      });
  }
}

async function assertUniqueNames(db: DbOrTx, workspaceId: string, input: Record<string, string>, exceptId?: string) {
  const existing = await listCategories(db, workspaceId);
  for (const [locale, name] of Object.entries(input)) {
    const clash = existing.find(
      (c) => c.id !== exceptId && c.names[locale]?.toLowerCase() === name.toLowerCase(),
    );
    if (clash) throw new AppError("conflict", `A category named "${name}" already exists`, { locale });
  }
}

export async function createCategory(ctx: Ctx, raw: z.input<typeof CreateCategoryInput>) {
  assertCan(ctx, "categories:write");
  const input = CreateCategoryInput.parse(raw);
  await assertUniqueNames(ctx.db, ctx.workspaceId, input.names);
  const existing = await listCategories(ctx.db, ctx.workspaceId);
  const id = newId();
  await ctx.db.insert(categories).values({
    id,
    workspaceId: ctx.workspaceId,
    color: input.color.toUpperCase(),
    position: existing.length,
  });
  await writeNames(ctx.db, id, input.names);
  return getCategory(ctx.db, ctx.workspaceId, id);
}

export async function getCategory(db: DbOrTx, workspaceId: string, id: string) {
  const cat = (await listCategories(db, workspaceId)).find((c) => c.id === id);
  if (!cat) throw notFound("Category");
  return cat;
}

export async function updateCategory(ctx: Ctx, id: string, raw: z.input<typeof UpdateCategoryInput>) {
  assertCan(ctx, "categories:write");
  const input = UpdateCategoryInput.parse(raw);
  await getCategory(ctx.db, ctx.workspaceId, id);
  if (input.color) {
    await ctx.db
      .update(categories)
      .set({ color: input.color.toUpperCase() })
      .where(and(eq(categories.id, id), eq(categories.workspaceId, ctx.workspaceId)));
  }
  if (input.names) {
    await assertUniqueNames(ctx.db, ctx.workspaceId, input.names, id);
    await writeNames(ctx.db, id, input.names);
  }
  return getCategory(ctx.db, ctx.workspaceId, id);
}

export async function reorderCategories(ctx: Ctx, orderedIds: string[]) {
  assertCan(ctx, "categories:write");
  const existing = await listCategories(ctx.db, ctx.workspaceId);
  const known = new Set(existing.map((c) => c.id));
  const ids = orderedIds.filter((id) => known.has(id));
  for (const c of existing) if (!ids.includes(c.id)) ids.push(c.id);
  for (const [position, id] of ids.entries()) {
    await ctx.db.update(categories).set({ position }).where(eq(categories.id, id));
  }
  return listCategories(ctx.db, ctx.workspaceId);
}

export async function deleteCategory(ctx: Ctx, id: string) {
  assertCan(ctx, "categories:write");
  await getCategory(ctx.db, ctx.workspaceId, id);
  await ctx.db.delete(categories).where(and(eq(categories.id, id), eq(categories.workspaceId, ctx.workspaceId)));
}

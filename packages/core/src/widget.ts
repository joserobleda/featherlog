import { type DbOrTx, widgetSettings } from "@featherlog/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { assertCan, type Ctx } from "./auth";
import { isLocale } from "./locales";

export type WidgetSettings = typeof widgetSettings.$inferSelect;

export const WIDGET_STRING_KEYS = ["title", "readMore", "footer", "back", "empty", "newBadge"] as const;

export const UpdateWidgetSettingsInput = z
  .object({
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
    badgeDelay: z.number().int().min(0).max(60),
    entriesLimit: z.number().int().min(1).max(20),
    expireAfterDays: z.number().int().min(1).max(365).nullable(),
    softHide: z.boolean(),
    eyecatcher: z.enum(["off", "on", "progressive"]),
    uiStrings: z
      .record(z.string(), z.partialRecord(z.enum(WIDGET_STRING_KEYS), z.string().max(120)))
      .refine((r) => Object.keys(r).every(isLocale), "Unsupported locale"),
  })
  .partial();

export async function getWidgetSettings(db: DbOrTx, workspaceId: string): Promise<WidgetSettings> {
  const [row] = await db.select().from(widgetSettings).where(eq(widgetSettings.workspaceId, workspaceId));
  if (row) return row;
  const [created] = await db.insert(widgetSettings).values({ workspaceId }).onConflictDoNothing().returning();
  return created ?? (await getWidgetSettings(db, workspaceId));
}

export async function updateWidgetSettings(ctx: Ctx, raw: z.input<typeof UpdateWidgetSettingsInput>) {
  assertCan(ctx, "settings:write");
  const input = UpdateWidgetSettingsInput.parse(raw);
  await getWidgetSettings(ctx.db, ctx.workspaceId);
  const [row] = await ctx.db
    .update(widgetSettings)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(widgetSettings.workspaceId, ctx.workspaceId))
    .returning();
  return row!;
}

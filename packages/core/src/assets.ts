import { assets } from "@featherlog/db";
import { assertCan, type Ctx } from "./auth";
import { newId } from "./ids";

export type AssetInput = {
  storageKey: string;
  mime: string;
  size: number;
  width?: number | null;
  height?: number | null;
};

/** Records an uploaded file (the bytes are already in storage). */
export async function createAsset(ctx: Ctx, input: AssetInput) {
  assertCan(ctx, "assets:write");
  const [row] = await ctx.db
    .insert(assets)
    .values({
      id: newId(),
      workspaceId: ctx.workspaceId,
      storageKey: input.storageKey,
      mime: input.mime,
      size: input.size,
      width: input.width ?? null,
      height: input.height ?? null,
      uploadedBy: ctx.actor.kind === "user" ? ctx.actor.userId : null,
    })
    .returning();
  return row!;
}

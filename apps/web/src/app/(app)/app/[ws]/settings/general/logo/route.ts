import {
  type Ctx,
  can,
  findWorkspaceBySlug,
  getMembershipRole,
  updateWorkspace,
} from "@featherlog/core";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import {
  deleteStoredImage,
  ImageError,
  isSameOrigin,
  storeSquareImage,
} from "../../_lib/square-image";

type Params = { params: Promise<{ ws: string }> };

async function resolve(req: Request, slug: string) {
  if (!isSameOrigin(req))
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const found = await findWorkspaceBySlug(db, slug);
  const role = found ? await getMembershipRole(db, found.workspace.id, session.user.id) : null;
  if (!found || !role) return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  const ctx: Ctx = {
    db,
    workspaceId: found.workspace.id,
    actor: { kind: "user", userId: session.user.id, role },
    via: "panel",
  };
  if (!can(ctx.actor, "settings:write")) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ctx, workspace: found.workspace };
}

/** Uploads a new workspace logo (`multipart/form-data` with `file`). */
export async function POST(req: Request, { params }: Params) {
  const { ws } = await params;
  const r = await resolve(req, ws);
  if ("error" in r) return r.error;
  const prefix = `logos/${r.workspace.id}`;
  try {
    const form = await req.formData().catch(() => null);
    const url = await storeSquareImage(form?.get("file") ?? null, prefix, { fit: "contain" });
    await updateWorkspace(r.ctx, { logoUrl: url });
    await deleteStoredImage(r.workspace.logoUrl, prefix);
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof ImageError) return NextResponse.json({ error: err.code }, { status: 422 });
    throw err;
  }
}

/** Removes the workspace logo. */
export async function DELETE(req: Request, { params }: Params) {
  const { ws } = await params;
  const r = await resolve(req, ws);
  if ("error" in r) return r.error;
  await updateWorkspace(r.ctx, { logoUrl: null });
  await deleteStoredImage(r.workspace.logoUrl, `logos/${r.workspace.id}`);
  return NextResponse.json({ ok: true });
}

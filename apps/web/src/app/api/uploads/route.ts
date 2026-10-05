import { findWorkspaceBySlug, getMembershipRole } from "@featherlog/core";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { storeImage, UploadError } from "@/lib/images";

/** Image upload for the panel editor (session auth). `multipart/form-data` with `file` and `workspace` (slug). */
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const slug = form?.get("workspace");
  if (!(file instanceof File) || typeof slug !== "string") {
    return NextResponse.json({ error: "Missing file or workspace" }, { status: 400 });
  }
  const found = await findWorkspaceBySlug(db, slug);
  const role = found ? await getMembershipRole(db, found.workspace.id, session.user.id) : null;
  if (!found || !role) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const asset = await storeImage(
      {
        db,
        workspaceId: found.workspace.id,
        actor: { kind: "user", userId: session.user.id, role },
        via: "panel",
      },
      { bytes: Buffer.from(await file.arrayBuffer()), mime: file.type, folder: "images" },
    );
    return NextResponse.json({
      url: asset.url,
      width: asset.width,
      height: asset.height,
      name: file.name,
    });
  } catch (err) {
    if (err instanceof UploadError)
      return NextResponse.json({ error: err.message }, { status: 422 });
    throw err;
  }
}

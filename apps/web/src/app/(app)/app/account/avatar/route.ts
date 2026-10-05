import { getUser, updateProfile } from "@featherlog/core";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import {
  deleteStoredImage,
  ImageError,
  isSameOrigin,
  storeSquareImage,
} from "../../[ws]/settings/_lib/square-image";

async function resolve(req: Request) {
  if (!isSameOrigin(req))
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  return { user: await getUser(db, session.user.id) };
}

/** Uploads a new profile picture (`multipart/form-data` with `file`). */
export async function POST(req: Request) {
  const r = await resolve(req);
  if ("error" in r) return r.error;
  const prefix = `avatars/${r.user.id}`;
  try {
    const form = await req.formData().catch(() => null);
    const url = await storeSquareImage(form?.get("file") ?? null, prefix, { fit: "cover" });
    await updateProfile(db, r.user.id, { image: url });
    await deleteStoredImage(r.user.image, prefix);
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof ImageError) return NextResponse.json({ error: err.code }, { status: 422 });
    throw err;
  }
}

/** Removes the profile picture. */
export async function DELETE(req: Request) {
  const r = await resolve(req);
  if ("error" in r) return r.error;
  await updateProfile(db, r.user.id, { image: null });
  await deleteStoredImage(r.user.image, `avatars/${r.user.id}`);
  return NextResponse.json({ ok: true });
}

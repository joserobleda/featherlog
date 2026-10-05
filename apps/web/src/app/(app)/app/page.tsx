import { listUserWorkspaces } from "@featherlog/core";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

export default async function AppIndex() {
  const session = await requireSession("/app");
  const workspaces = await listUserWorkspaces(db, session.user.id);
  if (workspaces.length === 0) redirect("/app/new");
  const last = (await cookies()).get("fl_last_ws")?.value;
  const target = workspaces.find((w) => w.workspace.slug === last) ?? workspaces[0]!;
  redirect(`/app/${target.workspace.slug}/posts`);
}

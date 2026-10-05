"use server";
import { acceptInvitation } from "@featherlog/core";
import { redirect } from "next/navigation";
import { runAction } from "@/lib/actions";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

export async function acceptInvitationAction(token: string) {
  const session = await requireSession(`/invite/${token}`);
  const res = await runAction(async () => {
    const ws = await acceptInvitation(db, token, session.user.id, { email: session.user.email });
    return { slug: ws.slug };
  });
  if (res.ok) redirect(`/app/${res.data.slug}/posts`);
  return res;
}

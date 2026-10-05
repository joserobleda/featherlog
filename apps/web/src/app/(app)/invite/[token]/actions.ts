"use server";
import { AppError, acceptInvitation, findInvitation } from "@featherlog/core";
import { redirect } from "next/navigation";
import { runAction } from "@/lib/actions";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

export async function acceptInvitationAction(token: string) {
  const session = await requireSession(`/invite/${token}`);
  const res = await runAction(async () => {
    const found = await findInvitation(db, token);
    if (!found) throw new AppError("not_found", "This invitation is invalid or has expired");
    if (found.invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
      throw new AppError("forbidden", "This invitation was sent to a different email address");
    }
    const ws = await acceptInvitation(db, token, session.user.id);
    return { slug: ws.slug };
  });
  if (res.ok) redirect(`/app/${res.data.slug}/posts`);
  return res;
}

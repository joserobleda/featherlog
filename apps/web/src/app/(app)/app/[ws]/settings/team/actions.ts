"use server";
import {
  assertMayResetPassword,
  changeMemberRole,
  inviteMember,
  listInvitations,
  type Role,
  removeMember,
  revokeInvitation,
  transferOwnership,
} from "@featherlog/core";
import { generateRandomString } from "better-auth/crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction } from "@/lib/actions";
import { auth } from "@/lib/auth";
import { invitationEmail } from "@/lib/emails";
import { env } from "@/lib/env";
import { sendMailSafe } from "@/lib/mailer";
import { getWorkspaceContext, type WorkspaceContext } from "@/lib/session";
import { appUrl } from "@/lib/urls";

const path = (slug: string) => `/app/${slug}/settings/team`;

async function invite(wc: WorkspaceContext, email: string, role: Role) {
  const { token, invitation } = await inviteMember(wc.ctx, { email, role });
  const inviter =
    (wc.session.user as { displayName?: string | null }).displayName || wc.session.user.name;
  const url = appUrl(`/invite/${token}`);
  // Without SMTP the link is shown in the dashboard to share by hand.
  if (env.emailEnabled) {
    await sendMailSafe(
      invitationEmail(invitation.email, { workspace: wc.workspace.name, inviter, url }),
    );
  }
  return { invitation, url, emailed: env.emailEnabled };
}

export async function inviteAction(wsSlug: string, input: { email: string; role: Role }) {
  const wc = await getWorkspaceContext(wsSlug);
  return runAction(async () => {
    const { invitation, url, emailed } = await invite(wc, input.email, input.role);
    revalidatePath(path(wc.workspace.slug));
    return { email: invitation.email, url, emailed };
  });
}

export async function resendInvitationAction(wsSlug: string, invitationId: string) {
  const wc = await getWorkspaceContext(wsSlug);
  return runAction(async () => {
    const pending = await listInvitations(wc.ctx);
    const inv = pending.find((i) => i.id === invitationId);
    if (!inv) throw new Error("Invitation not found");
    // Re-inviting revokes the old token and emails a fresh one.
    const { url, emailed } = await invite(wc, inv.email, inv.role as Role);
    revalidatePath(path(wc.workspace.slug));
    return { email: inv.email, url, emailed };
  });
}

export async function revokeInvitationAction(wsSlug: string, invitationId: string) {
  const { ctx, workspace } = await getWorkspaceContext(wsSlug);
  return runAction(async () => {
    await revokeInvitation(ctx, invitationId);
    revalidatePath(path(workspace.slug));
  });
}

export async function changeRoleAction(wsSlug: string, userId: string, role: Role) {
  const { ctx, workspace } = await getWorkspaceContext(wsSlug);
  return runAction(async () => {
    await changeMemberRole(ctx, userId, role);
    revalidatePath(path(workspace.slug));
  });
}

export async function removeMemberAction(wsSlug: string, userId: string) {
  const { ctx, workspace } = await getWorkspaceContext(wsSlug);
  return runAction(async () => {
    await removeMember(ctx, userId);
    revalidatePath(path(workspace.slug));
  });
}

export async function leaveWorkspaceAction(wsSlug: string) {
  const { ctx, session } = await getWorkspaceContext(wsSlug);
  const res = await runAction(() => removeMember(ctx, session.user.id));
  if (res.ok) redirect("/app");
  return res;
}

/** Shared by hand, so it lives longer than the 1-hour emailed link. */
const RESET_LINK_TTL_MS = 24 * 60 * 60 * 1000;

/** A one-time link for a member who forgot their password (works without SMTP). */
export async function resetPasswordLinkAction(wsSlug: string, userId: string) {
  const { ctx } = await getWorkspaceContext(wsSlug);
  return runAction(async () => {
    await assertMayResetPassword(ctx, userId);
    // Same token format as better-auth's own reset flow, so /reset-password consumes it.
    const token = generateRandomString(32, "a-z", "A-Z", "0-9");
    const { internalAdapter } = await auth.$context;
    await internalAdapter.createVerificationValue({
      identifier: `reset-password:${token}`,
      value: userId,
      expiresAt: new Date(Date.now() + RESET_LINK_TTL_MS),
    });
    return { url: appUrl(`/reset-password?token=${token}`) };
  });
}

export async function transferOwnershipAction(wsSlug: string, userId: string) {
  const { ctx, workspace } = await getWorkspaceContext(wsSlug);
  return runAction(async () => {
    await transferOwnership(ctx, userId);
    revalidatePath(`/app/${workspace.slug}`, "layout");
  });
}

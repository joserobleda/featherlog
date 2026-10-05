import { can, listInvitations, listMembers, type Role } from "@featherlog/core";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/panel/page-header";
import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/session";
import { type InvitationRow, type MemberRow, TeamManager } from "./team-manager";

export async function generateMetadata() {
  const t = await getTranslations("settings.team");
  return { title: t("title") };
}

export default async function TeamSettingsPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const { workspace, ctx, role, session } = await getWorkspaceContext(ws);
  const t = await getTranslations("settings.team");
  const isAdmin = can(ctx.actor, "members:admin");
  const [members, invitations] = await Promise.all([
    listMembers(db, workspace.id),
    isAdmin ? listInvitations(ctx) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <TeamManager
        wsSlug={workspace.slug}
        me={session.user.id}
        myRole={role}
        members={members.map(
          (m): MemberRow => ({
            userId: m.userId,
            name: m.name,
            displayName: m.displayName,
            email: m.email,
            image: m.image,
            role: m.role as Role,
            joinedAt: m.joinedAt,
          }),
        )}
        invitations={invitations.map(
          (i): InvitationRow => ({
            id: i.id,
            email: i.email,
            role: i.role as Role,
            expiresAt: i.expiresAt,
            createdAt: i.createdAt,
          }),
        )}
      />
    </>
  );
}

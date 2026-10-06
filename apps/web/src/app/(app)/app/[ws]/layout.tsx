import { can, countPendingReview } from "@featherlog/core";
import { getLocale } from "next-intl/server";
import { PanelShell } from "@/components/panel/panel-shell";
import { getWorkspaceContext } from "@/lib/session";
import { publicUrl } from "@/lib/urls";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  const { workspace, session, workspaces, ctx } = await getWorkspaceContext(ws);
  return (
    <PanelShell
      sidebar={{
        current: { slug: workspace.slug, name: workspace.name, logoUrl: workspace.logoUrl },
        workspaces: workspaces.map((w) => ({
          slug: w.workspace.slug,
          name: w.workspace.name,
          logoUrl: w.workspace.logoUrl,
        })),
        user: {
          name: session.user.name,
          email: session.user.email,
          image: session.user.image ?? null,
        },
        publicUrl: publicUrl(workspace.slug),
        canManage: can(ctx.actor, "settings:write"),
        pendingReview: await countPendingReview(ctx.db, workspace.id),
        uiLocale: await getLocale(),
      }}
    >
      {children}
    </PanelShell>
  );
}

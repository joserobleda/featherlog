import { can } from "@featherlog/core";
import { getLocale } from "next-intl/server";
import { Sidebar } from "@/components/panel/sidebar";
import { getWorkspaceContext } from "@/lib/session";
import { publicUrl } from "@/lib/urls";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const { workspace, session, workspaces, ctx } = await getWorkspaceContext(ws);
  return (
    <div className="flex h-dvh">
      <Sidebar
        current={{ slug: workspace.slug, name: workspace.name, logoUrl: workspace.logoUrl }}
        workspaces={workspaces.map((w) => ({ slug: w.workspace.slug, name: w.workspace.name, logoUrl: w.workspace.logoUrl }))}
        user={{ name: session.user.name, email: session.user.email, image: session.user.image ?? null }}
        publicUrl={publicUrl(workspace.slug)}
        canManage={can(ctx.actor, "settings:write")}
        uiLocale={await getLocale()}
      />
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

import { getWorkspaceContext } from "@/lib/session";
import { editorBase } from "../editor-data";
import { PostEditor } from "../post-editor";

export const metadata = { title: "New post" };

export default async function NewPostPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const wctx = await getWorkspaceContext(ws);
  const base = await editorBase(wctx);
  return (
    <PostEditor
      {...base}
      initial={{ translations: {}, publishedAt: null, published: false, authorId: wctx.session.user.id }}
    />
  );
}

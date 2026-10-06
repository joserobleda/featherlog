import { getPost, isAppError } from "@featherlog/core";
import { notFound } from "next/navigation";
import { getWorkspaceContext } from "@/lib/session";
import { editorBase } from "../editor-data";
import { PostEditor } from "../post-editor";

export const metadata = { title: "Edit post" };

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ ws: string; id: string }>;
}) {
  const { ws, id } = await params;
  const wctx = await getWorkspaceContext(ws);
  const post = await getPost(wctx.ctx, id).catch((e) => {
    if (isAppError(e) && e.code === "not_found") notFound();
    throw e;
  });
  const base = await editorBase(wctx);
  return (
    <PostEditor
      key={post.id}
      {...base}
      initial={{
        id: post.id,
        version: post.version,
        publicId: post.publicId,
        translations: Object.fromEntries(
          Object.entries(post.translations).map(([l, t]) => [
            l,
            { title: t.title, contentMd: t.contentMd },
          ]),
        ),
        slugs: Object.fromEntries(Object.entries(post.translations).map(([l, t]) => [l, t.slug])),
        publishedAt: post.publishedAt?.toISOString() ?? null,
        published: post.published,
        authorId: post.author?.id ?? null,
        createdVia: post.createdVia,
        actorLabel: post.actorLabel,
        review: post.review
          ? {
              requestedAt: post.review.requestedAt.toISOString(),
              requestedBy: post.review.requestedBy,
            }
          : null,
      }}
    />
  );
}

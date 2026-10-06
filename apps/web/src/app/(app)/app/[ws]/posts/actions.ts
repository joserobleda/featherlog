"use server";
import {
  createPost,
  deletePost,
  getPost,
  type Post,
  publishPost,
  unpublishPost,
  updatePost,
  withdrawReview,
} from "@featherlog/core";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { getWorkspaceContext } from "@/lib/session";

export type SavePostInput = {
  workspace: string;
  id?: string;
  expectedVersion?: number;
  /** null removes a translation. */
  translations: Record<string, { title: string; contentMd: string } | null>;
  publishedAt: string | null;
  published: boolean;
  authorId: string | null;
};

export type SavedPost = Pick<Post, "id" | "publicId" | "version" | "status" | "published"> & {
  publishedAt: string | null;
  slugs: Record<string, string>;
  review: { requestedAt: string; requestedBy: string | null } | null;
};

const toSaved = (p: Post): SavedPost => ({
  id: p.id,
  publicId: p.publicId,
  version: p.version,
  status: p.status,
  published: p.published,
  publishedAt: p.publishedAt?.toISOString() ?? null,
  slugs: Object.fromEntries(Object.entries(p.translations).map(([l, t]) => [l, t.slug])),
  review: p.review
    ? { requestedAt: p.review.requestedAt.toISOString(), requestedBy: p.review.requestedBy }
    : null,
});

export async function savePostAction(input: SavePostInput) {
  const { ctx, workspace } = await getWorkspaceContext(input.workspace);
  return runAction(async () => {
    const publishedAt = input.publishedAt ? new Date(input.publishedAt) : null;
    let post: Post;
    if (!input.id) {
      const translations = Object.fromEntries(
        Object.entries(input.translations).filter(
          (e): e is [string, { title: string; contentMd: string }] => !!e[1],
        ),
      );
      post = await createPost(ctx, {
        translations,
        publishedAt,
        publish: input.published,
        authorId: input.authorId,
      });
    } else {
      const current = await getPost(ctx, input.id);
      const translations: Record<string, { title: string; contentMd: string } | null> = {};
      for (const [locale, t] of Object.entries(input.translations)) {
        if (t === null) {
          if (current.translations[locale]) translations[locale] = null;
        } else {
          translations[locale] = t;
        }
      }
      post = await updatePost(
        ctx,
        input.id,
        { translations, publishedAt, authorId: input.authorId },
        { expectedVersion: input.expectedVersion },
      );
      if (input.published && !post.published)
        post = await publishPost(ctx, post.id, { at: publishedAt });
      else if (!input.published && post.published) post = await unpublishPost(ctx, post.id);
    }
    // The layout shows the review-queue counter in the sidebar.
    revalidatePath(`/app/${workspace.slug}`, "layout");
    return toSaved(post);
  });
}

/** "Return to draft": takes a post sent by an integration out of the review queue. */
export async function withdrawReviewAction(workspaceSlug: string, id: string, version?: number) {
  const { ctx, workspace } = await getWorkspaceContext(workspaceSlug);
  return runAction(async () => {
    const post = await withdrawReview(ctx, id, { expectedVersion: version });
    revalidatePath(`/app/${workspace.slug}`, "layout");
    return toSaved(post);
  });
}

export async function deletePostAction(workspaceSlug: string, id: string) {
  const { ctx, workspace } = await getWorkspaceContext(workspaceSlug);
  return runAction(async () => {
    await deletePost(ctx, id);
    revalidatePath(`/app/${workspace.slug}`, "layout");
  });
}

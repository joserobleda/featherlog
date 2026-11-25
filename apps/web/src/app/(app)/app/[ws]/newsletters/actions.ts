"use server";
import {
  AppError,
  createNewsletter,
  deleteNewsletter,
  getNewsletter,
  markNewsletterGenerating,
  removeNewsletterPosts,
  setNewsletterTranslation,
  startSendingNewsletter,
  updateNewsletterSettings,
} from "@featherlog/core";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { env } from "@/lib/env";
import { getWorkspaceContext } from "@/lib/session";
import { queueNewsletterGeneration, queueNewsletterSend } from "@/server/jobs";
import { previewNewsletterHtml, sendTestNewsletter } from "@/server/newsletters/run";

const base = (slug: string) => `/app/${slug}/newsletters`;

export async function createNewsletterAction(ws: string) {
  const { ctx, workspace } = await getWorkspaceContext(ws);
  return runAction(async () => {
    const nl = await createNewsletter(ctx, {
      status: "generating",
      generator: env.aiEnabled ? "ai" : "basic",
    });
    await queueNewsletterGeneration(workspace.id, nl.id);
    revalidatePath(base(workspace.slug));
    return { id: nl.id };
  });
}

export async function saveNewsletterTranslationAction(
  ws: string,
  id: string,
  locale: string,
  input: { subject: string; preheader: string; contentMd: string },
  version: number,
) {
  const { ctx, workspace } = await getWorkspaceContext(ws);
  return runAction(async () => {
    const nl = await setNewsletterTranslation(ctx, id, locale, input, { expectedVersion: version });
    revalidatePath(`${base(workspace.slug)}/${id}`);
    return { version: nl.version };
  });
}

export async function previewNewsletterAction(ws: string, id: string, locale: string) {
  const { workspace } = await getWorkspaceContext(ws);
  return runAction(async () => {
    const preview = await previewNewsletterHtml(workspace.id, id, locale);
    if (!preview) throw new AppError("not_found", "Save this language first");
    return { subject: preview.subject, html: preview.html };
  });
}

export async function removeNewsletterPostAction(ws: string, id: string, postId: string) {
  const { ctx, workspace } = await getWorkspaceContext(ws);
  return runAction(async () => {
    await removeNewsletterPosts(ctx, id, [postId]);
    revalidatePath(`${base(workspace.slug)}/${id}`);
  });
}

export async function regenerateNewsletterAction(ws: string, id: string) {
  const { ctx, workspace } = await getWorkspaceContext(ws);
  return runAction(async () => {
    await markNewsletterGenerating(ctx, id);
    await queueNewsletterGeneration(workspace.id, id);
    revalidatePath(`${base(workspace.slug)}/${id}`);
  });
}

export async function sendTestNewsletterAction(ws: string, id: string, locale: string) {
  const { ctx, workspace, session } = await getWorkspaceContext(ws);
  return runAction(async () => {
    if (!env.emailEnabled)
      throw new AppError("validation", "Email is not configured on this server (SMTP_URL)");
    await getNewsletter(ctx, id); // checks the permission
    await sendTestNewsletter(workspace.id, id, locale, session.user.email);
    return { to: session.user.email };
  });
}

export async function sendNewsletterAction(ws: string, id: string) {
  const { ctx, workspace } = await getWorkspaceContext(ws);
  return runAction(async () => {
    if (!env.emailEnabled)
      throw new AppError("validation", "Email is not configured on this server (SMTP_URL)");
    const r = await startSendingNewsletter(ctx, id);
    await queueNewsletterSend(workspace.id, id);
    revalidatePath(base(workspace.slug));
    revalidatePath(`${base(workspace.slug)}/${id}`);
    return r;
  });
}

export async function deleteNewsletterAction(ws: string, id: string) {
  const { ctx, workspace } = await getWorkspaceContext(ws);
  return runAction(async () => {
    await deleteNewsletter(ctx, id);
    revalidatePath(base(workspace.slug));
  });
}

export async function updateNewsletterSettingsAction(
  ws: string,
  input: {
    fromName: string;
    replyTo: string;
    footerText: string;
    aiInstructions: string;
    skipReaders: boolean;
  },
) {
  const { ctx, workspace } = await getWorkspaceContext(ws);
  return runAction(async () => {
    await updateNewsletterSettings(ctx, { ...input, fromName: input.fromName.trim() || null });
    revalidatePath(`${base(workspace.slug)}/settings`);
  });
}

import {
  type Ctx,
  completeNewsletterDraft,
  failNewsletter,
  finishSendingIfDone,
  getNewsletter,
  getNewsletterSettings,
  getWorkspace,
  hydratePosts,
  listCategories,
  pendingDeliveries,
  recordDelivery,
  SCOPES,
} from "@featherlog/core";
import { posts as postsTable } from "@featherlog/db";
import { inArray } from "drizzle-orm";
import { clickToken, trackedPostUrl } from "@/lib/click-tokens";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { mailer } from "@/lib/mailer";
import {
  unsubscribeOneClickUrl,
  unsubscribePageUrl,
  unsubscribeToken,
} from "@/lib/unsubscribe-tokens";
import { AiWriterError, aiDraft } from "./ai-writer";
import { basicDraft, linkFor } from "./draft";
import { newsletterMail, type RenderedEdition, renderEdition } from "./email";
import { MAILGUN_VARIABLES_HEADER, mailgunVariables } from "./mailgun";

/** The newsletter's posts, hydrated, in the newsletter's order. */
async function newsletterPosts(items: { postId: string; position: number }[]) {
  if (items.length === 0) return [];
  const rows = await db
    .select()
    .from(postsTable)
    .where(
      inArray(
        postsTable.id,
        items.map((p) => p.postId),
      ),
    );
  const order = new Map(items.map((p) => [p.postId, p.position]));
  return (await hydratePosts(db, rows)).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}

/**
 * Replaces links to the newsletter's posts with per-recipient tracked links, so a click counts as
 * a read. Matches the exact URLs the drafts generate, in every language.
 */
function trackLinks(
  edition: RenderedEdition,
  links: Map<string, string>,
  publicId: string,
  token: string,
): RenderedEdition {
  let { html, text } = edition;
  for (const [url, postPublicId] of links) {
    const tracked = trackedPostUrl(publicId, token, postPublicId);
    html = html.split(`href="${url}"`).join(`href="${tracked}"`);
    text = text.split(url).join(tracked);
  }
  return { ...edition, html, text };
}

/** Background jobs act for the workspace itself. */
export function systemCtx(workspaceId: string): Ctx {
  return {
    db,
    workspaceId,
    actor: { kind: "api_key", apiKeyId: "system", scopes: [...SCOPES], label: "Featherlog" },
    via: "api",
  };
}

/**
 * Writes the draft of a `generating` newsletter: with Claude when ANTHROPIC_API_KEY is set,
 * otherwise (or if Claude fails) a basic draft with each post's title and excerpt.
 */
export async function generateNewsletter(workspaceId: string, newsletterId: string) {
  const ctx = systemCtx(workspaceId);
  const nl = await getNewsletter(ctx, newsletterId);
  if (nl.status !== "generating") return;
  const ws = await getWorkspace(db, workspaceId);
  const posts = await newsletterPosts(nl.posts);
  const period = { from: nl.periodFrom, to: nl.periodTo };
  try {
    if (posts.length === 0) throw new Error("The newsletter has no posts");
    let draft = null;
    let generator: "ai" | "basic" = "basic";
    if (env.aiEnabled) {
      try {
        const settings = await getNewsletterSettings(db, workspaceId);
        draft = await aiDraft(ws, posts, await listCategories(db, workspaceId), {
          instructions: settings.aiInstructions,
          period,
        });
        generator = "ai";
      } catch (err) {
        logger.error(
          { err: err instanceof AiWriterError ? err.message : err, newsletterId },
          "AI newsletter writer failed; using the basic draft",
        );
      }
    }
    draft ??= basicDraft(ws, posts, period);
    await completeNewsletterDraft(db, workspaceId, newsletterId, { generator, ...draft });
    logger.info({ newsletterId, generator }, "newsletter draft ready");
  } catch (err) {
    logger.error({ err, newsletterId }, "newsletter generation failed");
    await failNewsletter(db, workspaceId, newsletterId, String((err as Error)?.message ?? err));
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends pending deliveries of a `sending` newsletter, throttled to NEWSLETTER_RATE_PER_MINUTE.
 * Stops after `budgetMs` and returns false when there is more to send (the caller re-queues).
 * Each delivery is marked before the next one goes out, so a crash never emails anyone twice
 * beyond the one in flight.
 */
export async function sendNewsletterBatch(
  workspaceId: string,
  newsletterId: string,
  budgetMs = 4 * 60_000,
) {
  const started = Date.now();
  const ctx = systemCtx(workspaceId);
  const nl = await getNewsletter(ctx, newsletterId);
  if (nl.status !== "sending") return true;
  const ws = await getWorkspace(db, workspaceId);
  const settings = await getNewsletterSettings(db, workspaceId);
  const editions = new Map<string, (unsubscribeUrl: string) => RenderedEdition>();
  for (const [locale, tr] of Object.entries(nl.translations))
    editions.set(locale, await renderEdition(ws, settings, locale, tr));
  const links = new Map<string, string>();
  for (const p of await newsletterPosts(nl.posts))
    for (const locale of ws.locales) links.set(linkFor(ws, p, locale), p.publicId);
  const gap = 60_000 / env.NEWSLETTER_RATE_PER_MINUTE;

  while (Date.now() - started < budgetMs) {
    const batch = await pendingDeliveries(db, newsletterId, 50);
    if (batch.length === 0) break;
    for (const d of batch) {
      const t0 = Date.now();
      const render = editions.get(d.locale) ?? editions.values().next().value!;
      const token = unsubscribeToken(workspaceId, d.subscriberId);
      const mail = newsletterMail(
        d.email,
        trackLinks(
          render(unsubscribePageUrl(ws.publicId, token)),
          links,
          ws.publicId,
          clickToken(workspaceId, d.subscriberId),
        ),
        settings,
        ws,
        unsubscribeOneClickUrl(ws.publicId, token),
        {
          [MAILGUN_VARIABLES_HEADER]: mailgunVariables({
            workspaceId,
            subscriberId: d.subscriberId,
            newsletterId,
          }),
        },
      );
      try {
        await mailer.send(mail);
        await recordDelivery(db, newsletterId, d.subscriberId, { ok: true });
      } catch (err) {
        await recordDelivery(db, newsletterId, d.subscriberId, {
          ok: false,
          error: String((err as Error)?.message ?? err),
        });
      }
      const wait = gap - (Date.now() - t0);
      if (wait > 0) await sleep(wait);
      if (Date.now() - started >= budgetMs) break;
    }
  }
  return finishSendingIfDone(db, workspaceId, newsletterId);
}

/** Sends one edition to a single address, with a placeholder unsubscribe link. */
export async function sendTestNewsletter(
  workspaceId: string,
  newsletterId: string,
  locale: string,
  to: string,
) {
  const ctx = systemCtx(workspaceId);
  const nl = await getNewsletter(ctx, newsletterId);
  const tr = nl.translations[locale];
  if (!tr) throw new Error(`No ${locale} version to send`);
  const ws = await getWorkspace(db, workspaceId);
  const settings = await getNewsletterSettings(db, workspaceId);
  const render = await renderEdition(ws, settings, locale, tr);
  const edition = render(unsubscribePageUrl(ws.publicId, "test"));
  await mailer.send(
    newsletterMail(to, { ...edition, subject: `[Test] ${edition.subject}` }, settings, ws, null),
  );
}

/** HTML preview for the dashboard. */
export async function previewNewsletterHtml(
  workspaceId: string,
  newsletterId: string,
  locale: string,
) {
  const nl = await getNewsletter(systemCtx(workspaceId), newsletterId);
  const tr = nl.translations[locale];
  if (!tr) return null;
  const ws = await getWorkspace(db, workspaceId);
  const settings = await getNewsletterSettings(db, workspaceId);
  return (await renderEdition(ws, settings, locale, tr))("#unsubscribe");
}

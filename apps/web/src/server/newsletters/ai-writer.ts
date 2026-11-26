import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  type Category,
  categoryName,
  localeInfo,
  type Post,
  type Workspace,
} from "@featherlog/core";
import { z } from "zod";
import { env } from "@/lib/env";
import {
  type DraftResult,
  type EditionPlan,
  editionMarkdown,
  normalizePlan,
  periodLabel,
} from "./draft";

const Item = z.object({
  postId: z.string(),
  title: z.string(),
  summary: z.string(),
});

const Edition = z.object({
  locale: z.string(),
  subject: z.string(),
  preheader: z.string(),
  intro: z.string(),
  featured: z.array(Item),
  brief: z.array(Item),
});

const Output = z.object({ editions: z.array(Edition) });

const SYSTEM = `You write the periodic product-updates email of a software product. You receive the changelog posts published since the previous email and write one edition of the email per requested language.

How to write each edition:
- Pick the posts that matter most to customers (new features and big improvements first) as "featured": usually 2 to 4. Every other post goes in "brief". Every post appears exactly once, in featured or in brief. Order each list by importance.
- People skim this email. Keep it short and easy to scan: every sentence must earn its place.
- Featured: a short benefit-oriented title and a summary of 1 or 2 short sentences (under 40 words) that says what changes for the reader. The app shows the post's screenshot under the title, so don't describe the screen. Brief: the post's title (shortened if needed) and an empty summary, or half a line when the title alone is unclear.
- When a post's title starts with an emoji, start your title for it with the same emoji. Use no other emojis.
- Write from the product team to its customers, warm and concrete. No hype, no exclamation marks in every sentence. Do not invent features, dates, numbers or promises that are not in the posts.
- subject: under 70 characters and specific (name the one or two most important changes). preheader: under 110 characters, complements the subject. intro: one short sentence.
- Write each edition natively in its language. When a post has no version in that language, translate it from the version it has. Keep product and feature names as the posts write them.
- Plain text only in every field: no Markdown, no links, no URLs (the app adds the links).
- Use the post ids exactly as given.`;

/** Thrown when Claude declines or returns something unusable; the caller falls back. */
export class AiWriterError extends Error {}

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }));

export async function aiDraft(
  ws: Workspace,
  posts: Post[],
  categories: Category[],
  opts: { instructions: string; period: { from: Date | null; to: Date | null } },
): Promise<DraftResult> {
  const languages = ws.locales.map((code) => ({
    code,
    name: localeInfo(code)?.name ?? code,
    period: periodLabel(code, opts.period.from, opts.period.to),
  }));
  const input = {
    product: ws.name,
    website: ws.websiteUrl,
    languages,
    posts: posts.map((p) => ({
      id: p.id,
      publishedAt: p.publishedAt?.toISOString().slice(0, 10),
      categories: p.categoryIds
        .map((id) => categories.find((c) => c.id === id))
        .filter((c): c is Category => !!c)
        .map((c) => categoryName(c, ws.defaultLocale, ws.defaultLocale)),
      versions: Object.values(p.translations).map((t) => ({
        language: t.locale,
        title: t.title,
        text: t.text,
      })),
    })),
  };

  const system = opts.instructions.trim()
    ? `${SYSTEM}\n\nThe product team's own guidance for this email:\n${opts.instructions.trim()}`
    : SYSTEM;

  // Streaming: one edition per language can be long. Server-side fallback re-runs the request
  // on another model if Claude Opus 5.5 declines it.
  const stream = anthropic().beta.messages.stream({
    model: env.NEWSLETTER_MODEL,
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(Output) },
    system,
    messages: [
      {
        role: "user",
        content: `Write the email in these languages: ${languages.map((l) => l.code).join(", ")}.\n\n${JSON.stringify(input, null, 2)}`,
      },
    ],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal")
    throw new AiWriterError("Claude declined to write this newsletter");
  if (message.stop_reason === "max_tokens")
    throw new AiWriterError("The newsletter was too long for one response");
  const output = message.parsed_output;
  if (!output) throw new AiWriterError("Claude's answer could not be read");

  const translations: DraftResult["translations"] = {};
  let order: DraftResult["posts"] | null = null;
  for (const code of ws.locales) {
    const edition = output.editions.find((e) => e.locale === code);
    if (!edition) continue;
    const plan: EditionPlan = normalizePlan(edition, posts, ws, code);
    translations[code] = {
      subject: plan.subject.trim().slice(0, 200),
      preheader: plan.preheader.trim().slice(0, 250),
      contentMd: editionMarkdown(plan, posts, ws, code),
    };
    if (code === ws.defaultLocale || !order)
      order = [
        ...plan.featured.map((i) => ({ postId: i.postId, featured: true })),
        ...plan.brief.map((i) => ({ postId: i.postId, featured: false })),
      ];
  }
  if (!order || Object.keys(translations).length === 0)
    throw new AiWriterError("Claude did not return any of the workspace languages");
  return { translations, posts: order };
}

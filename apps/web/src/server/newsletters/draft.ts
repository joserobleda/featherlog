import type { Post, Workspace } from "@featherlog/core";
import { fill, newsletterStrings } from "@/lib/newsletter-i18n";
import { postUrl } from "@/lib/public-urls";
import { appUrl } from "@/lib/urls";

/** What a writer decides for one language; the app turns it into Markdown with real links. */
export type EditionPlan = {
  subject: string;
  preheader: string;
  intro: string;
  featured: { postId: string; title: string; summary: string }[];
  brief: { postId: string; title: string; summary: string }[];
};

export type DraftResult = {
  translations: Record<string, { subject: string; preheader: string; contentMd: string }>;
  /** Order and treatment, from the default-language edition. */
  posts: { postId: string; featured: boolean }[];
};

/** The translation of a post shown in `locale`, falling back to the default language, then any. */
export function translationFor(post: Post, locale: string, defaultLocale: string) {
  return (
    post.translations[locale] ??
    post.translations[defaultLocale] ??
    Object.values(post.translations)[0]!
  );
}

/** Link to the post in the edition's language when it exists there, else to the one that does. */
export function linkFor(ws: Workspace, post: Post, locale: string) {
  const tr = translationFor(post, locale, ws.defaultLocale);
  return postUrl(ws, { slug: tr.slug, publicId: post.publicId }, tr.locale);
}

/** First image of the post in `locale` (absolute URL), to illustrate it in the email. */
export function imageFor(ws: Workspace, post: Post, locale: string) {
  const src = translationFor(post, locale, ws.defaultLocale).contentHtml?.match(
    /<img\b[^>]*?\ssrc="([^"]+)"/i,
  )?.[1];
  if (!src) return null;
  const url = src.replace(/&amp;/g, "&");
  if (/^https?:\/\//i.test(url)) return url;
  return url.startsWith("/") ? appUrl(url) : null;
}

const LEADING_EMOJI =
  /^(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)\s*(.+)$/u;

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
const mdText = (s: string) => oneLine(s).replace(/([\\[\]])/g, "\\$1");

/**
 * Makes sure every post appears exactly once (writers may skip or repeat one) and drops ids
 * that are not in the newsletter.
 */
export function normalizePlan(plan: EditionPlan, posts: Post[], ws: Workspace, locale: string) {
  const byId = new Map(posts.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const keep = (items: EditionPlan["featured"]) =>
    items.filter((i) => byId.has(i.postId) && !seen.has(i.postId) && seen.add(i.postId));
  const featured = keep(plan.featured);
  const brief = keep(plan.brief);
  for (const p of posts)
    if (!seen.has(p.id)) {
      const tr = translationFor(p, locale, ws.defaultLocale);
      brief.push({ postId: p.id, title: tr.title, summary: tr.excerpt });
    }
  return { ...plan, featured, brief };
}

/** Markdown for one edition: intro, featured posts as sections, the rest as a list. */
export function editionMarkdown(plan: EditionPlan, posts: Post[], ws: Workspace, locale: string) {
  const t = newsletterStrings(locale);
  const byId = new Map(posts.map((p) => [p.id, p]));
  const parts: string[] = [];
  if (plan.intro.trim()) parts.push(plan.intro.trim());
  for (const item of plan.featured) {
    const post = byId.get(item.postId)!;
    const url = linkFor(ws, post, locale);
    const image = imageFor(ws, post, locale);
    parts.push(
      `## ${oneLine(item.title)}`,
      image ? `[![](${image})](${url})` : "",
      item.summary.trim(),
      `[${t.readMore} →](${url})`,
    );
  }
  if (plan.brief.length) {
    if (plan.featured.length) parts.push(`### ${t.alsoNew}`);
    parts.push(
      plan.brief
        .map((item) => {
          const url = linkFor(ws, byId.get(item.postId)!, locale);
          const summary = oneLine(item.summary);
          // A leading emoji stays outside the link, so the underline starts at the words.
          const [, emoji = "", title = item.title] = oneLine(item.title).match(LEADING_EMOJI) ?? [];
          return `- ${emoji ? `${emoji} ` : ""}**[${mdText(title)}](${url})**${summary ? ` — ${summary}` : ""}`;
        })
        .join("\n"),
    );
  }
  return parts.filter(Boolean).join("\n\n");
}

export function periodLabel(locale: string, from: Date | null, to: Date | null) {
  const date = to ?? from ?? new Date();
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date);
}

/** Draft without AI: the three newest posts in full (title + excerpt), the rest as a list. */
export function basicDraft(
  ws: Workspace,
  posts: Post[],
  period: { from: Date | null; to: Date | null },
): DraftResult {
  const newestFirst = [...posts].sort(
    (a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
  );
  const featuredIds = new Set(newestFirst.slice(0, 3).map((p) => p.id));
  const translations: DraftResult["translations"] = {};
  for (const locale of ws.locales) {
    const t = newsletterStrings(locale);
    const item = (p: Post) => {
      const tr = translationFor(p, locale, ws.defaultLocale);
      return { postId: p.id, title: tr.title, summary: tr.excerpt };
    };
    const plan: EditionPlan = {
      subject: fill(t.subject, {
        workspace: ws.name,
        period: periodLabel(locale, period.from, period.to),
      }),
      preheader: fill(t.preheader, { count: posts.length }),
      intro: fill(t.intro, { workspace: ws.name }),
      featured: newestFirst.filter((p) => featuredIds.has(p.id)).map(item),
      brief: newestFirst.filter((p) => !featuredIds.has(p.id)).map(item),
    };
    translations[locale] = {
      subject: plan.subject,
      preheader: plan.preheader,
      contentMd: editionMarkdown(plan, posts, ws, locale),
    };
  }
  return {
    translations,
    posts: newestFirst.map((p) => ({ postId: p.id, featured: featuredIds.has(p.id) })),
  };
}

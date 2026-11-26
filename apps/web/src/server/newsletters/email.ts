import { localeInfo, type NewsletterSettings, type Workspace } from "@featherlog/core";
import { renderMarkdown } from "@featherlog/markdown";
import type { Mail } from "@/lib/mailer";
import { fill, newsletterStrings } from "@/lib/newsletter-i18n";
import { listUrl } from "@/lib/public-urls";

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

const STYLES: Record<string, string> = {
  h1: "font-size:22px;line-height:1.3;margin:28px 0 8px;color:#111827",
  h2: "font-size:19px;line-height:1.35;margin:28px 0 8px;color:#111827",
  h3: "font-size:16px;line-height:1.4;margin:28px 0 8px;color:#111827;text-transform:none",
  p: "font-size:15px;line-height:1.6;margin:0 0 14px;color:#374151",
  ul: "padding-left:20px;margin:0 0 14px",
  ol: "padding-left:20px;margin:0 0 14px",
  li: "font-size:15px;line-height:1.6;margin:0 0 8px;color:#374151",
  blockquote: "margin:0 0 14px;padding:0 0 0 14px;border-left:3px solid #e5e7eb;color:#6b7280",
  img: "max-width:100%;height:auto;border-radius:8px",
  hr: "border:0;border-top:1px solid #e5e7eb;margin:24px 0",
  pre: "background:#f3f4f6;border-radius:8px;padding:12px;overflow:auto;font-size:13px",
  code: "background:#f3f4f6;border-radius:4px;padding:1px 4px;font-size:13px",
  table: "border-collapse:collapse;width:100%;margin:0 0 14px",
  td: "border:1px solid #e5e7eb;padding:6px 8px;font-size:14px",
  th: "border:1px solid #e5e7eb;padding:6px 8px;font-size:14px;text-align:left",
};

/**
 * Turns the dashboard's Markdown into email-safe HTML: no iframes (video embeds become links),
 * no classes or CSS variables, inline styles on every element.
 */
export async function emailBodyHtml(md: string, accent: string, baseUrl: string) {
  const { html } = await renderMarkdown(md, { highlight: false, baseUrl });
  return (
    html
      // Video embeds: <div class="fl-video"…><iframe src="…" title="…"></iframe></div> → link.
      .replace(
        /<div[^>]*class="fl-video[^"]*"[^>]*>\s*<iframe[^>]*src="([^"]+)"[^>]*?(?:title="([^"]*)")?[^>]*><\/iframe>\s*<\/div>/g,
        (_m, src: string, title?: string) => `<p><a href="${src}">▶ ${title || "Video"}</a></p>`,
      )
      .replace(/<iframe[^>]*src="([^"]+)"[^>]*><\/iframe>/g, '<a href="$1">▶ Video</a>')
      .replace(/\s(?:class|style|loading|decoding|data-[\w-]+)="[^"]*"/g, "")
      .replace(
        /<(h1|h2|h3|p|ul|ol|li|blockquote|img|hr|pre|code|table|td|th)(\s|>|\/)/g,
        (_m, tag, next) => `<${tag} style="${STYLES[tag]}"${next}`,
      )
      .replace(/<img([^>]*?)\ssrc="([^"]+)"/g, (_m, before: string, src: string) => {
        const url = emailImageUrl(src.replace(/&amp;/g, "&")).replace(/&/g, "&amp;");
        return `<img${before} src="${url}"`;
      })
      .replace(/<a\s/g, `<a style="color:${accent};text-decoration:underline" `)
  );
}

/** Our own WebP/AVIF uploads go out as their PNG/JPEG copy, which every email client shows. */
export function emailImageUrl(url: string) {
  return /\/uploads\/[^?#]+\.(webp|avif)$/i.test(url) ? `${url}?format=email` : url;
}

/** Plain-text part: the Markdown with links spelled out. */
export function emailBodyText(md: string) {
  return md
    .replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, "$1 ($2)")
    .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, "$1: $2")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\\([\\[\]])/g, "$1");
}

export type RenderedEdition = { subject: string; preheader: string; html: string; text: string };

/** Renders the shared part of an edition once; `personalize` adds each recipient's links. */
export async function renderEdition(
  ws: Workspace,
  settings: Pick<NewsletterSettings, "footerText">,
  locale: string,
  tr: { subject: string; preheader: string; contentMd: string },
) {
  const t = newsletterStrings(locale);
  const accent = /^#[0-9a-f]{6}$/i.test(ws.accentColor) ? ws.accentColor : "#3778FF";
  const body = await emailBodyHtml(tr.contentMd, accent, listUrl(ws, locale));
  const dir = localeInfo(locale)?.dir ?? "ltr";
  const all = listUrl(ws, locale);
  const footer = settings.footerText.trim();
  const logo = ws.logoUrl
    ? `<img src="${esc(emailImageUrl(ws.logoUrl))}" alt="${esc(ws.name)}" height="32" style="height:32px;max-width:200px;vertical-align:middle">`
    : `<span style="font-weight:700;font-size:18px;color:#111827">${esc(ws.name)}</span>`;

  return (unsubscribeUrl: string): RenderedEdition => ({
    subject: tr.subject,
    preheader: tr.preheader,
    html: `<!doctype html><html lang="${locale}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(tr.subject)}</title></head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(tr.preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<div style="max-width:600px;margin:0 auto;padding:32px 16px">
  <div style="padding:0 8px 20px">${logo}</div>
  <div style="background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;border-top:4px solid ${accent};padding:28px 28px 16px">
    ${body}
    <p style="margin:24px 0 8px"><a href="${esc(all)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px">${esc(t.allUpdates)}</a></p>
  </div>
  <div style="padding:20px 8px;color:#9ca3af;font-size:12px;line-height:1.6">
    ${footer ? `<p style="margin:0 0 6px">${esc(footer).replace(/\n/g, "<br>")}</p>` : ""}
    <p style="margin:0">${esc(fill(t.why, { workspace: ws.name }))} <a href="${esc(unsubscribeUrl)}" style="color:#6b7280">${esc(t.unsubscribe)}</a></p>
  </div>
</div></body></html>`,
    text: [
      emailBodyText(tr.contentMd),
      `${t.allUpdates}: ${all}`,
      "--",
      footer,
      fill(t.why, { workspace: ws.name }),
      `${t.unsubscribe}: ${unsubscribeUrl}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
}

export function newsletterMail(
  to: string,
  edition: RenderedEdition,
  settings: Pick<NewsletterSettings, "fromName" | "replyTo">,
  ws: Workspace,
  oneClickUrl: string | null,
  extraHeaders: Record<string, string> = {},
): Mail {
  return {
    to,
    subject: edition.subject,
    html: edition.html,
    text: edition.text,
    fromName: settings.fromName || ws.name,
    replyTo: settings.replyTo,
    headers: {
      ...extraHeaders,
      ...(oneClickUrl
        ? {
            "List-Unsubscribe": `<${oneClickUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }
        : {}),
    },
  };
}

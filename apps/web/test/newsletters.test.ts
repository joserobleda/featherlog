import type { Post, Workspace } from "@featherlog/core";
import { describe, expect, it } from "vitest";
import { fromWithName } from "@/lib/mailer";
import { unsubscribeToken, verifyUnsubscribeToken } from "@/lib/unsubscribe-tokens";
import { basicDraft, editionMarkdown, normalizePlan } from "@/server/newsletters/draft";
import { emailBodyHtml, emailBodyText, renderEdition } from "@/server/newsletters/email";

const ws = {
  id: "ws1",
  slug: "acme",
  name: "Acme",
  publicId: "Pub1",
  defaultLocale: "en",
  locales: ["en", "es"],
  accentColor: "#112233",
  logoUrl: null,
  websiteUrl: null,
} as unknown as Workspace;

const post = (id: string, daysAgo: number, tr: Record<string, [string, string]>): Post =>
  ({
    id,
    publicId: `p${id}`,
    publishedAt: new Date(Date.now() - daysAgo * 86_400_000),
    categoryIds: [],
    translations: Object.fromEntries(
      Object.entries(tr).map(([locale, [title, excerpt]]) => [
        locale,
        { locale, title, slug: title.toLowerCase().replace(/\W+/g, "-"), excerpt, text: excerpt },
      ]),
    ),
  }) as unknown as Post;

const posts = [
  post("a", 5, { en: ["Old fix", "Fixed a bug."] }),
  post("b", 4, { en: ["Reports", "New reports."], es: ["Informes", "Nuevos informes."] }),
  post("c", 3, { en: ["Dark mode", "Themes."] }),
  post("d", 1, { en: ["SSO [beta]", "Sign in with SAML."] }),
];

describe("newsletter drafts", () => {
  it("writes a basic draft per language: newest three in full, the rest as a list", () => {
    const d = basicDraft(ws, posts, { from: posts[0]!.publishedAt, to: posts[3]!.publishedAt });
    expect(d.posts).toEqual([
      { postId: "d", featured: true },
      { postId: "c", featured: true },
      { postId: "b", featured: true },
      { postId: "a", featured: false },
    ]);
    const es = d.translations.es!;
    expect(es.subject).toMatch(/^Novedades de Acme · /);
    expect(es.preheader).toBe("4 novedades desde nuestro último email");
    // Spanish edition links to the Spanish post when it exists, else to the English one.
    expect(es.contentMd).toContain("## Informes");
    expect(es.contentMd).toContain("/acme/es/informes-pb");
    expect(es.contentMd).toContain("/acme/dark-mode-pc");
    expect(es.contentMd).toContain("### Otras novedades");
    expect(d.translations.en!.contentMd).toContain("[Read more →]");
  });

  it("keeps every post exactly once whatever the writer returns", () => {
    const plan = normalizePlan(
      {
        subject: "S",
        preheader: "P",
        intro: "Hi",
        featured: [
          { postId: "d", title: "SSO", summary: "Sign in with SAML." },
          { postId: "nope", title: "X", summary: "Invented" },
        ],
        brief: [
          { postId: "d", title: "SSO again", summary: "" },
          { postId: "c", title: "Dark mode", summary: "" },
        ],
      },
      posts,
      ws,
      "en",
    );
    expect(plan.featured.map((i) => i.postId)).toEqual(["d"]);
    expect(plan.brief.map((i) => i.postId)).toEqual(["c", "a", "b"]);
    const md = editionMarkdown(plan, posts, ws, "en");
    expect(md).toContain("- **[Dark mode](http");
    expect(md).not.toContain("Invented");
  });

  it("escapes brackets in list titles", () => {
    const md = editionMarkdown(
      {
        subject: "",
        preheader: "",
        intro: "",
        featured: [],
        brief: [{ postId: "d", title: "SSO [beta]", summary: "" }],
      },
      posts,
      ws,
      "en",
    );
    expect(md).toContain("**[SSO \\[beta\\]](");
  });
});

describe("newsletter emails", () => {
  it("renders email-safe HTML: inline styles, no iframes or classes", async () => {
    const html = await emailBodyHtml(
      "## Title\n\nText with [a link](https://x.com).\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "#112233",
      "https://changelog.test/acme",
    );
    expect(html).not.toMatch(/<iframe|class="/);
    expect(html).toContain('<h2 style="');
    expect(html).toContain("color:#112233");
    expect(html).toMatch(/<a [^>]*href="https:\/\/www\.youtube-nocookie\.com[^"]*"[^>]*>▶/);
  });

  it("spells out links in the text part", () => {
    expect(emailBodyText("## Hi\n\n**[Dark](https://x.com/d)** — themes")).toBe(
      "Hi\n\nDark: https://x.com/d — themes",
    );
  });

  it("adds the preheader, the footer and each recipient's unsubscribe link", async () => {
    const render = await renderEdition(ws, { footerText: "Acme Inc\nStreet 1" }, "es", {
      subject: "Novedades",
      preheader: "Lo nuevo",
      contentMd: "Hola",
    });
    const e = render("https://app.test/unsubscribe/Pub1/tok");
    expect(e.html).toContain("Lo nuevo");
    expect(e.html).toContain("Acme Inc<br>Street 1");
    expect(e.html).toContain('href="https://app.test/unsubscribe/Pub1/tok"');
    expect(e.html).toContain("Recibes este email porque usas Acme.");
    expect(e.text).toContain("Darse de baja: https://app.test/unsubscribe/Pub1/tok");
  });
});

describe("unsubscribe tokens and senders", () => {
  it("only accepts tokens signed for the same workspace", () => {
    const token = unsubscribeToken("ws1", "sub123");
    expect(verifyUnsubscribeToken("ws1", token)).toBe("sub123");
    expect(verifyUnsubscribeToken("ws2", token)).toBeNull();
    expect(verifyUnsubscribeToken("ws1", `sub999.${token.split(".")[1]}`)).toBeNull();
    expect(verifyUnsubscribeToken("ws1", "garbage")).toBeNull();
  });

  it("puts the workspace name in front of MAIL_FROM's address", () => {
    expect(fromWithName("Acme", "Featherlog <no-reply@x.com>")).toBe('"Acme" <no-reply@x.com>');
    expect(fromWithName('Evil "Co"', "no-reply@x.com")).toBe('"Evil Co" <no-reply@x.com>');
    expect(fromWithName(null, "a@x.com")).toBe("a@x.com");
  });
});

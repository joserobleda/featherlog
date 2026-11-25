import type { Post, Workspace } from "@featherlog/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Record<string, unknown>[] = [];
let reply: { stop_reason: string; parsed_output: unknown } = {
  stop_reason: "end_turn",
  parsed_output: null,
};

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = {
      messages: {
        stream: (params: Record<string, unknown>) => {
          calls.push(params);
          return { finalMessage: async () => reply };
        },
      },
    };
  },
}));

const { aiDraft, AiWriterError } = await import("@/server/newsletters/ai-writer");

const ws = {
  id: "ws1",
  slug: "acme",
  name: "Acme",
  defaultLocale: "en",
  locales: ["en", "es"],
  websiteUrl: null,
} as unknown as Workspace;

const post = (id: string, title: string): Post =>
  ({
    id,
    publicId: `p${id}`,
    publishedAt: new Date("2026-11-20"),
    categoryIds: [],
    translations: {
      en: {
        locale: "en",
        title,
        slug: title.toLowerCase(),
        excerpt: `${title}.`,
        text: `${title}.`,
      },
    },
  }) as unknown as Post;

const posts = [post("a", "Reports"), post("b", "Fixes")];
const opts = { instructions: "Be brief.", period: { from: null, to: new Date("2026-11-20") } };

describe("AI newsletter writer", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("asks Claude Opus 5.5 with structured output and server-side fallback", async () => {
    reply = {
      stop_reason: "end_turn",
      parsed_output: {
        editions: [
          {
            locale: "es",
            subject: "Informes nuevos",
            preheader: "Y correcciones",
            intro: "Hola.",
            featured: [{ postId: "a", title: "Informes", summary: "Ya puedes exportar." }],
            brief: [{ postId: "b", title: "Correcciones", summary: "" }],
          },
          {
            locale: "en",
            subject: "New reports",
            preheader: "And fixes",
            intro: "Hi.",
            featured: [{ postId: "b", title: "Fixes", summary: "Many." }],
            brief: [],
          },
        ],
      },
    };
    const d = await aiDraft(ws, posts, [], opts);
    const params = calls[0]!;
    expect(params).toMatchObject({
      model: "claude-opus-5-5",
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
    });
    expect(String(params.system)).toContain("Be brief.");
    // The order follows the default-language edition; missing posts are appended as briefs.
    expect(d.posts).toEqual([
      { postId: "b", featured: true },
      { postId: "a", featured: false },
    ]);
    expect(d.translations.es!.subject).toBe("Informes nuevos");
    expect(d.translations.es!.contentMd).toContain("## Informes");
    expect(d.translations.en!.contentMd).toContain("- **[Reports](");
  });

  it("throws on refusals and empty answers so the caller falls back", async () => {
    reply = { stop_reason: "refusal", parsed_output: null };
    await expect(aiDraft(ws, posts, [], opts)).rejects.toBeInstanceOf(AiWriterError);
    reply = { stop_reason: "end_turn", parsed_output: { editions: [] } };
    await expect(aiDraft(ws, posts, [], opts)).rejects.toBeInstanceOf(AiWriterError);
  });
});

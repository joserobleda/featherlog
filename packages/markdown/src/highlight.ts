import type { Element, Root } from "hast";
import { toString as hastToString } from "hast-util-to-string";
import { createHighlighter, type Highlighter } from "shiki";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { visit } from "unist-util-visit";

export const SHIKI_THEMES = { light: "github-light", dark: "github-dark" } as const;

export const SHIKI_LANGS = [
  "javascript",
  "typescript",
  "jsx",
  "tsx",
  "json",
  "bash",
  "shellscript",
  "html",
  "css",
  "python",
  "go",
  "ruby",
  "php",
  "java",
  "sql",
  "yaml",
  "diff",
  "markdown",
] as const;

let highlighterPromise: Promise<Highlighter> | undefined;

/** Lazily creates (once) and caches the shared Shiki highlighter. Works in Node and browsers. */
export function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({
    themes: [SHIKI_THEMES.light, SHIKI_THEMES.dark],
    langs: [...SHIKI_LANGS],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  }).catch((error: unknown) => {
    highlighterPromise = undefined;
    throw error;
  });
  return highlighterPromise;
}

function resolveLang(highlighter: Highlighter, lang: string): string | null {
  const loaded = highlighter.getLoadedLanguages();
  const lower = lang.toLowerCase();
  if (loaded.includes(lower)) return lower;
  try {
    const resolved = highlighter.resolveLangAlias(lower);
    return loaded.includes(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

/** Replaces `<pre><code class="language-x">` blocks with Shiki output (dual themes, CSS vars). */
export function highlightTree(tree: Root, highlighter: Highlighter): void {
  visit(tree, "element", (node: Element, index, parent) => {
    if (node.tagName !== "pre" || !parent || index === undefined) return;
    const code = node.children.find(
      (c): c is Element => c.type === "element" && c.tagName === "code",
    );
    if (!code) return;
    const classes = code.properties.className;
    const langClass = Array.isArray(classes)
      ? classes.find((c) => String(c).startsWith("language-"))
      : undefined;
    if (!langClass) return;
    const lang = resolveLang(highlighter, String(langClass).slice("language-".length));
    if (!lang) return;
    try {
      const out = highlighter.codeToHast(hastToString(code).replace(/\n$/, ""), {
        lang,
        themes: SHIKI_THEMES,
        defaultColor: false,
      });
      const pre = out.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "pre",
      );
      if (!pre) return;
      pre.properties.dataLanguage = lang;
      parent.children[index] = pre;
    } catch {
      // Leave the plain code block in place.
    }
  });
}

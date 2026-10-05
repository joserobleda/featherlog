import type { Element, ElementContent, Root as HastRoot, Properties } from "hast";
import type {
  Image,
  Link,
  Root as MdastRoot,
  Paragraph,
  PhrasingContent,
  RootContent,
} from "mdast";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { SKIP, visit } from "unist-util-visit";
import {
  categoryMarkerNames,
  categoryTextColor,
  isHexColor,
  type MdCategory,
  normalizeCategoryName,
} from "./categories";
import { makeExcerpt } from "./excerpt";
import { getHighlighter, highlightTree } from "./highlight";
import { decodeSizeTitle, type MediaSize, preprocessSizing, sizeToProperties } from "./sizing";
import { parseVideoUrl, type VideoInfo, videoLabel } from "./video";

export type RenderOptions = {
  categories?: MdCategory[];
  /** Syntax-highlight fenced code with Shiki. Default `true`. */
  highlight?: boolean;
  /** Resolves relative link/image URLs and decides which links count as external. */
  baseUrl?: string;
};

export type RenderResult = { html: string; categoryIds: string[]; excerpt: string; text: string };

type Embed = { video: VideoInfo; title: string; size: MediaSize | null };

type Context = {
  nonce: string;
  embeds: Map<string, Embed>;
  categoryGroups: Map<string, MdCategory[]>;
  categoryIds: string[];
  categoriesByName: Map<string, MdCategory>;
  imageSizes: Map<string, MediaSize>;
  source: string;
  counter: number;
};

/** A placeholder mdast node; it becomes `<div data-fl-key>` and is swapped after sanitizing. */
type Placeholder = { type: "flPlaceholder"; data: { hName: "div"; hProperties: Properties } };

const KEY_PROP = "dataFlKey";

function makeNonce(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function placeholder(ctx: Context): { key: string; node: Placeholder } {
  const key = `${ctx.nonce}-${ctx.counter++}`;
  return {
    key,
    node: { type: "flPlaceholder", data: { hName: "div", hProperties: { [KEY_PROP]: key } } },
  };
}

// ---------------------------------------------------------------------------
// Sanitize schema: GitHub-like defaults, minus risky protocols, plus our placeholder key.
// ---------------------------------------------------------------------------

const schema = {
  ...defaultSchema,
  // remark-rehype already prefixes footnote ids with `user-content-`; avoid double prefixing.
  clobberPrefix: "",
  attributes: {
    ...defaultSchema.attributes,
    div: [...(defaultSchema.attributes?.div ?? []), KEY_PROP],
    img: ["alt", "src", "title", KEY_PROP],
  },
  protocols: {
    href: ["http", "https", "mailto"],
    src: ["http", "https"],
    cite: ["http", "https"],
  },
};

// ---------------------------------------------------------------------------
// mdast transforms (run before sanitizing; they only emit placeholders)
// ---------------------------------------------------------------------------

function isAutolink(link: Link, source: string): boolean {
  const start = link.position?.start.offset;
  const end = link.position?.end.offset;
  if (start === undefined || end === undefined) return false;
  return !source.slice(start, end).startsWith("[");
}

function endsLine(next: PhrasingContent | undefined): boolean {
  if (!next) return true;
  if (next.type === "break") return true;
  return next.type === "text" && /^[ \t]*(?:\r?\n|$)/.test(next.value);
}

function trimSegment(nodes: PhrasingContent[]): PhrasingContent[] {
  const out = [...nodes];
  while (out.length) {
    const first = out[0];
    if (first?.type === "break") out.shift();
    else if (first?.type === "text") {
      first.value = first.value.replace(/^\s+/, "");
      if (first.value) break;
      out.shift();
    } else break;
  }
  while (out.length) {
    const last = out[out.length - 1];
    if (last?.type === "break") out.pop();
    else if (last?.type === "text") {
      last.value = last.value.replace(/\s+$/, "");
      if (last.value) break;
      out.pop();
    } else break;
  }
  return out;
}

function videoFor(node: PhrasingContent, next: PhrasingContent | undefined, ctx: Context) {
  if (node.type === "image") {
    const video = parseVideoUrl(node.url);
    if (!video) return null;
    return {
      video,
      title: node.alt?.trim() || node.title?.trim() || videoLabel(video.provider),
      size: (node.data as { flSize?: MediaSize } | undefined)?.flSize ?? null,
    } satisfies Embed;
  }
  if (node.type === "link" && endsLine(next) && isAutolink(node, ctx.source)) {
    const video = parseVideoUrl(node.url);
    if (!video) return null;
    return { video, title: videoLabel(video.provider), size: null } satisfies Embed;
  }
  return null;
}

function splitVideos(paragraph: Paragraph, ctx: Context): RootContent[] | null {
  const kids = paragraph.children;
  const out: RootContent[] = [];
  let segment: PhrasingContent[] = [];
  let changed = false;
  const flush = () => {
    const trimmed = trimSegment(segment);
    if (trimmed.length) out.push({ type: "paragraph", children: trimmed });
    segment = [];
  };
  for (let i = 0; i < kids.length; i++) {
    const kid = kids[i];
    if (!kid) continue;
    const embed = videoFor(kid, kids[i + 1], ctx);
    if (!embed) {
      segment.push(kid);
      continue;
    }
    changed = true;
    flush();
    const { key, node } = placeholder(ctx);
    ctx.embeds.set(key, embed);
    out.push(node as unknown as RootContent);
  }
  if (!changed) return null;
  flush();
  return out;
}

function transformMdast(tree: MdastRoot, ctx: Context): void {
  // 1. Decode sizing markers on images.
  visit(tree, "image", (node: Image) => {
    const decoded = decodeSizeTitle(node.title);
    if (!decoded) return;
    node.title = decoded.title;
    const key = `${ctx.nonce}-${ctx.counter++}`;
    ctx.imageSizes.set(key, decoded.size);
    node.data = {
      ...node.data,
      flSize: decoded.size,
      hProperties: { [KEY_PROP]: key },
    } as Image["data"];
  });

  // 2. Inline categories (top-level paragraphs only).
  if (ctx.categoriesByName.size) {
    tree.children = tree.children.map((child) => {
      if (child.type !== "paragraph") return child;
      const names = categoryMarkerNames(child);
      if (!names) return child;
      const cats = names.map((n) => ctx.categoriesByName.get(normalizeCategoryName(n)));
      if (!cats.every((c): c is MdCategory => c !== undefined)) return child;
      const unique = cats.filter((c, i) => cats.findIndex((o) => o.id === c.id) === i);
      for (const c of unique) if (!ctx.categoryIds.includes(c.id)) ctx.categoryIds.push(c.id);
      const { key, node } = placeholder(ctx);
      ctx.categoryGroups.set(key, unique);
      return node as unknown as RootContent;
    });
  }

  // 3. Video embeds.
  visit(tree, "paragraph", (node: Paragraph, index, parent) => {
    if (!parent || index === undefined) return;
    const replacement = splitVideos(node, ctx);
    if (!replacement) return;
    (parent.children as RootContent[]).splice(index, 1, ...replacement);
    return [SKIP, index + replacement.length];
  });
}

// ---------------------------------------------------------------------------
// hast transforms (run after sanitizing; trusted output)
// ---------------------------------------------------------------------------

function hasClass(node: Element, name: string): boolean {
  const c = node.properties.className;
  return Array.isArray(c) && c.includes(name);
}

function embedElement(embed: Embed): Element {
  const style = embed.size ? sizeToProperties(embed.size, true).style : undefined;
  return {
    type: "element",
    tagName: "div",
    properties: { className: ["fl-video"], ...(style ? { style } : {}) },
    children: [
      {
        type: "element",
        tagName: "iframe",
        properties: {
          src: embed.video.embedUrl,
          title: embed.title,
          loading: "lazy",
          allowFullScreen: true,
          allow: "autoplay; fullscreen; picture-in-picture",
          referrerPolicy: "strict-origin-when-cross-origin",
        },
        children: [],
      },
    ],
  };
}

function categoriesElement(cats: MdCategory[]): Element {
  const children: ElementContent[] = [];
  cats.forEach((cat, i) => {
    if (i > 0) children.push({ type: "text", value: " " });
    const color = cat.color.trim();
    const style = isHexColor(color)
      ? `--fl-cat:${color};--fl-cat-fg:${categoryTextColor(color)}`
      : undefined;
    children.push({
      type: "element",
      tagName: "span",
      properties: {
        className: ["fl-category"],
        dataCategoryId: cat.id,
        ...(style ? { style } : {}),
      },
      children: [{ type: "text", value: cat.name }],
    });
  });
  return { type: "element", tagName: "p", properties: { className: ["fl-categories"] }, children };
}

function resolveUrl(value: string, baseUrl: string | undefined): string {
  if (!baseUrl || /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("#")) return value;
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return value;
  }
}

function isExternal(href: string, baseUrl: string | undefined): boolean {
  if (!/^https?:\/\//i.test(href)) return false;
  if (!baseUrl) return true;
  try {
    return new URL(href).origin !== new URL(baseUrl).origin;
  } catch {
    return true;
  }
}

function transformHast(tree: HastRoot, ctx: Context, baseUrl: string | undefined): void {
  visit(tree, "element", (node: Element, index, parent) => {
    if (!parent || index === undefined) return;

    if (node.tagName === "div" && node.properties[KEY_PROP] !== undefined) {
      const key = String(node.properties[KEY_PROP]);
      const embed = ctx.embeds.get(key);
      const cats = ctx.categoryGroups.get(key);
      if (embed) parent.children[index] = embedElement(embed);
      else if (cats) parent.children[index] = categoriesElement(cats);
      else {
        parent.children.splice(index, 1);
        return [SKIP, index];
      }
      return SKIP;
    }

    if (node.tagName === "a" && typeof node.properties.href === "string") {
      const href = resolveUrl(node.properties.href, baseUrl);
      node.properties.href = href;
      if (isExternal(href, baseUrl)) {
        node.properties.target = "_blank";
        node.properties.rel = ["noopener", "noreferrer", "nofollow"];
      }
    }

    if (node.tagName === "img") {
      if (typeof node.properties.src !== "string" || !node.properties.src) {
        parent.children.splice(index, 1);
        return [SKIP, index];
      }
      node.properties.src = resolveUrl(node.properties.src, baseUrl);
      const key = node.properties[KEY_PROP];
      node.properties[KEY_PROP] = undefined;
      const size = key === undefined ? undefined : ctx.imageSizes.get(String(key));
      if (size) Object.assign(node.properties, sizeToProperties(size));
      node.properties.loading = "lazy";
      node.properties.decoding = "async";
    }
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

function plainText(tree: HastRoot): string {
  const parts: string[] = [];
  const walk = (nodes: HastRoot["children"] | ElementContent[]) => {
    for (const node of nodes) {
      if (node.type === "text") parts.push(node.value);
      else if (node.type === "element") {
        if (hasClass(node, "fl-video") || hasClass(node, "fl-categories")) {
          parts.push(" ");
          continue;
        }
        if (node.tagName === "br") parts.push(" ");
        walk(node.children);
        if (node.tagName !== "span" && node.tagName !== "a") parts.push(" ");
      }
    }
  };
  walk(tree.children);
  return parts.join("").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

export async function renderMarkdown(md: string, opts: RenderOptions = {}): Promise<RenderResult> {
  const source = preprocessSizing(md ?? "");
  const categoriesByName = new Map<string, MdCategory>();
  for (const cat of opts.categories ?? []) {
    const key = normalizeCategoryName(cat.name);
    if (key && !categoriesByName.has(key)) categoriesByName.set(key, cat);
  }
  const ctx: Context = {
    nonce: makeNonce(),
    embeds: new Map(),
    categoryGroups: new Map(),
    categoryIds: [],
    categoriesByName,
    source,
    counter: 0,
    imageSizes: new Map(),
  };

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize, schema)
    .use(rehypeStringify);

  const mdast = processor.parse(source);
  transformMdast(mdast, ctx);

  const hast = (await processor.run(mdast)) as HastRoot;
  transformHast(hast, ctx, opts.baseUrl);

  if (opts.highlight !== false) {
    try {
      highlightTree(hast, await getHighlighter());
    } catch {
      // Highlighting is best-effort; fall back to plain code blocks.
    }
  }

  const text = plainText(hast);
  return {
    html: processor.stringify(hast),
    categoryIds: ctx.categoryIds,
    excerpt: makeExcerpt(text),
    text,
  };
}

/** Category names used in inline category markers (`[New] [Fix]`), in order, deduped. */
export function extractCategoryNames(md: string): string[] {
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .parse(md ?? "");
  const seen = new Set<string>();
  const names: string[] = [];
  for (const child of tree.children) {
    if (child.type !== "paragraph") continue;
    for (const name of categoryMarkerNames(child) ?? []) {
      const key = normalizeCategoryName(name);
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

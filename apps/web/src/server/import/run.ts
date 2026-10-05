import {
  type Ctx,
  createPost,
  findImportedPost,
  findWorkspaceBySlug,
  listMembers,
  recordImport,
  setTranslation,
} from "@featherlog/core";
import type { Db } from "@featherlog/db";
import { fetchPublicUrl } from "@/server/api/ssrf";
import { storeImage } from "@/server/media";
import {
  crawlHeadway,
  groupDate,
  type HeadwayEntry,
  headwayToMarkdown,
  type ImportGroup,
  type PairOverrides,
  pairEntries,
  type Source,
} from "./headway";

export type HeadwayImportOptions = {
  db: Db;
  workspace: string;
  /** `{ account: "acme-changelog", locale: "en" }` — the first one is the primary language. */
  sources: { account: string; locale: string }[];
  dryRun?: boolean;
  overrides?: PairOverrides;
  fetch?: typeof fetch;
  /** Downloads an image URL (defaults to the SSRF-guarded public fetcher). */
  downloadImage?: (url: string) => Promise<{ bytes: Buffer; mime: string }>;
  delayMs?: number;
  log?: (msg: string) => void;
};

export type HeadwayImportResult = {
  report: string;
  groups: number;
  created: number;
  translationsAdded: number;
  skipped: number;
  images: number;
};

const sourceKey = (account: string) => `headway:${account}`;

/** Imports published Headway entries into a workspace, pairing per-language accounts into translations. */
export async function importHeadway(opts: HeadwayImportOptions): Promise<HeadwayImportResult> {
  const log = opts.log ?? (() => {});
  const found = await findWorkspaceBySlug(opts.db, opts.workspace);
  if (!found) throw new Error(`Workspace "${opts.workspace}" not found`);
  const ws = found.workspace;
  const missing = opts.sources.map((s) => s.locale).filter((l) => !ws.locales.includes(l));
  if (missing.length) {
    throw new Error(
      `Enable these languages in the workspace first (Settings → Languages): ${missing.join(", ")}`,
    );
  }
  const owner = (await listMembers(opts.db, ws.id)).find((m) => m.role === "owner");
  if (!owner) throw new Error("The workspace has no owner");
  const ctx: Ctx = {
    db: opts.db,
    workspaceId: ws.id,
    actor: { kind: "user", userId: owner.userId, role: "owner", label: "Headway import" },
    via: "panel",
  };

  const sources: Source[] = [];
  for (const s of opts.sources) {
    log(`Reading headwayapp.co/${s.account} …`);
    const entries = await crawlHeadway(s.account, { fetch: opts.fetch, delayMs: opts.delayMs });
    log(`  ${entries.length} published entries`);
    sources.push({ ...s, entries });
  }
  const groups = pairEntries(sources, opts.overrides);
  const report = buildReport(sources, groups);
  const result: HeadwayImportResult = {
    report,
    groups: groups.length,
    created: 0,
    translationsAdded: 0,
    skipped: 0,
    images: 0,
  };
  if (opts.dryRun) return result;

  const download =
    opts.downloadImage ??
    ((url: string) =>
      fetchPublicUrl(url, 10 * 1024 * 1024).then((r) => ({ bytes: r.bytes, mime: r.mime })));
  const imageMap = new Map<string, string>();
  const rehost = async (entries: HeadwayEntry[]) => {
    for (const url of entries.flatMap((e) => e.images)) {
      if (imageMap.has(url)) continue;
      try {
        const file = await download(url);
        const asset = await storeImage(ctx, { ...file, folder: "images" });
        imageMap.set(url, asset.url);
        result.images++;
      } catch (err) {
        log(
          `  ! could not copy image ${url}: ${err instanceof Error ? err.message : err} (keeping the original URL)`,
        );
      }
    }
  };

  for (const [i, g] of groups.entries()) {
    const entries = Object.entries(g.items);
    const existing = await Promise.all(
      entries.map(async ([locale, e]) => ({
        locale,
        e,
        imported: await findImportedPost(opts.db, ws.id, sourceKey(e.account), e.id),
      })),
    );
    const todo = existing.filter((x) => !x.imported);
    if (todo.length === 0) {
      result.skipped++;
      continue;
    }
    await rehost(todo.map((x) => x.e));
    const translation = (e: HeadwayEntry) => ({
      title: e.title,
      contentMd: headwayToMarkdown(e, imageMap),
    });
    const already = existing.find((x) => x.imported)?.imported;
    if (already) {
      // Part of the group was imported earlier (e.g. after a manual pairing): add the missing languages.
      for (const x of todo) {
        await setTranslation(ctx, already.postId, x.locale, translation(x.e));
        await recordImport(opts.db, {
          workspaceId: ws.id,
          source: sourceKey(x.e.account),
          externalId: x.e.id,
          postId: already.postId,
          locale: x.locale,
        });
        result.translationsAdded++;
      }
      continue;
    }
    const post = await createPost(ctx, {
      translations: Object.fromEntries(todo.map((x) => [x.locale, translation(x.e)])),
      publish: true,
      publishedAt: new Date(groupDate(g)),
      authorId: null,
    });
    for (const x of todo) {
      await recordImport(opts.db, {
        workspaceId: ws.id,
        source: sourceKey(x.e.account),
        externalId: x.e.id,
        postId: post.id,
        locale: x.locale,
      });
    }
    result.created++;
    if ((i + 1) % 10 === 0) log(`  ${i + 1}/${groups.length} …`);
  }
  return result;
}

/* ------------------------------------------------------------------ */

function buildReport(sources: Source[], groups: ImportGroup[]) {
  const locales = sources.map((s) => s.locale);
  const lines: string[] = [];
  const count = (m: ImportGroup["match"]) => groups.filter((g) => g.match === m).length;
  const paired = groups.filter((g) => Object.keys(g.items).length > 1);
  lines.push("# Headway import preview", "");
  for (const s of sources)
    lines.push(`- **${s.locale}** — headwayapp.co/${s.account}: ${s.entries.length} entries`);
  lines.push(
    `- **Posts to create:** ${groups.length} (${paired.length} with several languages, ${groups.length - paired.length} in one language)`,
    `- **Images:** ${new Set(sources.flatMap((s) => s.entries.flatMap((e) => e.images))).size} to copy`,
    `- **Matched by:** same day ${count("same-day")}, shared image ${count("shared-image")}, creation order ${count("time-order")}, nearby date ${count("adjacent-day")}, manual ${count("manual")}`,
    "",
    "Review the rows marked ⚠️ (matched by order or adjacent day) and the single-language posts.",
    "Fix with `--pair <id>:<id>` or `--unpair <id>`.",
    "",
    `| Date | ${locales.map((l) => l.toUpperCase()).join(" | ")} | Match |`,
    `|---|${locales.map(() => "---").join("|")}|---|`,
  );
  for (const g of groups) {
    const cells = locales.map((l) =>
      g.items[l] ? `${cell(g.items[l]!.title)} \`${g.items[l]!.id}\`` : "—",
    );
    const warn =
      g.match === "time-order" ||
      g.match === "adjacent-day" ||
      (g.match === "single" && sources.length > 1);
    lines.push(
      `| ${groupDate(g).slice(0, 10)} | ${cells.join(" | ")} | ${warn ? "⚠️ " : ""}${g.match} |`,
    );
  }
  return lines.join("\n");
}

const cell = (s: string) => s.replace(/\|/g, "\\|").slice(0, 80);

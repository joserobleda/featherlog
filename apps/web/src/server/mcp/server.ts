import {
  type Actor,
  AppError,
  type Ctx,
  countPendingReview,
  createCategory,
  createPost,
  deletePost,
  getMembershipRole,
  getPost,
  getWidgetSettings,
  getWorkspace,
  isAppError,
  listCategories,
  listPosts,
  listUserWorkspaces,
  publishPost,
  requestReview,
  type Scope,
  schedulePost,
  setTranslation,
  unpublishPost,
  updatePost,
  updateWidgetSettings,
  type Workspace,
} from "@featherlog/core";
import { MARKDOWN_GUIDE, renderMarkdown } from "@featherlog/markdown";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { storeImage } from "@/lib/images";
import {
  serializeCategory,
  serializePost,
  serializePostWithQueue,
  serializeWorkspace,
} from "../api/serializers";
import { fetchPublicUrl } from "../api/ssrf";

/** Who is calling the MCP endpoint. */
export type McpPrincipal =
  | { kind: "api_key"; workspaceId: string; actor: Actor }
  | { kind: "user"; userId: string; scopes: Scope[]; clientName: string };

const INSTRUCTIONS = `Featherlog is a changelog: you write product updates ("posts") that appear on a public changelog page and in an in-app widget.

- Posts have one translation per language (\`translations: { en: { title, contentMd }, es: {...} }\`). Use \`get_workspace\` to see enabled languages and categories.
- Write content in Markdown. Label a post with categories by adding a paragraph with the category name in brackets, e.g. \`[New]\` or \`[Fix] [Improvement]\` (names in that translation's language). Read the \`featherlog://guide/markdown\` resource for all syntax (video embeds, image sizing).
- New posts are drafts. Publishing (\`publish_post\`/\`schedule_post\`) may be disabled for integrations by the workspace. Then the post goes to the **review queue** instead (\`status: "in_review"\`): a human approves it from the dashboard. The response includes \`adminUrl\` (link to review it) and \`pendingReviewCount\` (posts waiting in total) — share both when you tell the team (e.g. in Slack) that there is a new update to review. You can also send a draft to review explicitly with \`request_review\`, and list the queue with \`list_posts\` and \`status: "in_review"\`.
- Prefer updating an existing draft over creating duplicates. Pass \`expectedVersion\` from the last read to avoid overwriting human edits.`;

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
  };
}

function fail(err: unknown) {
  const message = isAppError(err)
    ? `${err.code}: ${err.message}`
    : err instanceof Error
      ? err.message
      : "Unexpected error";
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

async function guarded<T>(fn: () => Promise<T>) {
  try {
    return ok(await fn());
  } catch (err) {
    return fail(err);
  }
}

const workspaceArg = z
  .string()
  .optional()
  .describe(
    "Workspace slug. Only needed when your account has several workspaces (see list_workspaces).",
  );

const translationsArg = z
  .record(
    z.string(),
    z.object({ title: z.string().min(1).max(200), contentMd: z.string().max(100_000).default("") }),
  )
  .describe(
    'Translations keyed by locale, e.g. { "en": { "title": "…", "contentMd": "[New]\\n\\n…" } }',
  );

export function buildMcpServer(principal: McpPrincipal) {
  /** Resolves the workspace + domain context for a tool call. */
  async function resolve(slug?: string): Promise<{ ctx: Ctx; workspace: Workspace }> {
    if (principal.kind === "api_key") {
      const workspace = await getWorkspace(db, principal.workspaceId);
      if (slug && slug !== workspace.slug)
        throw new AppError("forbidden", "This API key belongs to another workspace");
      return {
        workspace,
        ctx: { db, workspaceId: workspace.id, actor: principal.actor, via: "mcp" },
      };
    }
    const memberships = await listUserWorkspaces(db, principal.userId);
    if (memberships.length === 0)
      throw new AppError("not_found", "You are not a member of any workspace");
    const chosen = slug
      ? memberships.find((m) => m.workspace.slug === slug)
      : memberships.length === 1
        ? memberships[0]
        : undefined;
    if (!chosen) {
      throw new AppError(
        "validation",
        `Specify a workspace. Available: ${memberships.map((m) => m.workspace.slug).join(", ")}`,
      );
    }
    const role = (await getMembershipRole(db, chosen.workspace.id, principal.userId))!;
    return {
      workspace: chosen.workspace,
      ctx: {
        db,
        workspaceId: chosen.workspace.id,
        actor: {
          kind: "user",
          userId: principal.userId,
          role,
          scopes: principal.scopes,
          label: principal.clientName,
        },
        via: "mcp",
      },
    };
  }

  const server = new McpServer(
    { name: "featherlog", title: "Featherlog", version: "1.0.0", websiteUrl: env.APP_URL },
    { instructions: INSTRUCTIONS },
  );

  /* ---------------- workspaces ---------------- */

  server.registerTool(
    "list_workspaces",
    {
      title: "List workspaces",
      description: "Workspaces (changelogs) you can manage.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () =>
      guarded(async () => {
        if (principal.kind === "api_key")
          return {
            workspaces: [serializeWorkspace(await getWorkspace(db, principal.workspaceId))],
          };
        const rows = await listUserWorkspaces(db, principal.userId);
        return {
          workspaces: rows.map((r) => ({ ...serializeWorkspace(r.workspace), role: r.role })),
        };
      }),
  );

  server.registerTool(
    "get_workspace",
    {
      title: "Get workspace",
      description:
        "Workspace settings, enabled languages and categories (with names per language). Call this before writing posts.",
      inputSchema: z.object({ workspace: workspaceArg }),
      annotations: { readOnlyHint: true },
    },
    async ({ workspace }) =>
      guarded(async () => {
        const r = await resolve(workspace);
        const categories = await listCategories(db, r.workspace.id);
        return {
          ...serializeWorkspace(r.workspace),
          categories: categories.map(serializeCategory),
          canPublish: r.workspace.integrationsCanPublish,
        };
      }),
  );

  /* ---------------- posts ---------------- */

  server.registerTool(
    "list_posts",
    {
      title: "List posts",
      description:
        'Posts, newest first. Filter by status, language or text. `status: "in_review"` lists the review queue. Also returns `pendingReviewCount`.',
      inputSchema: z.object({
        workspace: workspaceArg,
        status: z.enum(["all", "draft", "in_review", "scheduled", "published"]).optional(),
        locale: z.string().optional(),
        missingLocale: z
          .string()
          .optional()
          .describe("Only posts not yet translated to this locale"),
        q: z.string().optional().describe("Full-text search in titles and content"),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ workspace, ...filters }) =>
      guarded(async () => {
        const r = await resolve(workspace);
        const page = await listPosts(r.ctx, { ...filters, limit: filters.limit ?? 20 });
        return {
          items: page.items.map((p) => serializePost(r.workspace, p)),
          nextCursor: page.nextCursor,
          pendingReviewCount: await countPendingReview(db, r.workspace.id),
        };
      }),
  );

  server.registerTool(
    "get_post",
    {
      title: "Get post",
      description:
        "A post with all its translations. Use `version` as `expectedVersion` when updating.",
      inputSchema: z.object({
        workspace: workspaceArg,
        id: z.string().describe("Post id or public id"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ workspace, id }) =>
      guarded(async () => {
        const r = await resolve(workspace);
        return serializePost(r.workspace, await getPost(r.ctx, id));
      }),
  );

  server.registerTool(
    "create_post",
    {
      title: "Create post",
      description:
        "Creates a post as a draft. Add one translation per language you want to publish in. With `submitForReview: true` it goes straight to the review queue.",
      inputSchema: z.object({
        workspace: workspaceArg,
        translations: translationsArg,
        publishedAt: z
          .string()
          .datetime({ offset: true })
          .optional()
          .describe("Planned publication date (ISO 8601)"),
        submitForReview: z
          .boolean()
          .optional()
          .describe("Send it to the review queue for a human to approve and publish"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ workspace, translations, publishedAt, submitForReview }) =>
      guarded(async () => {
        const r = await resolve(workspace);
        const post = await createPost(r.ctx, {
          translations,
          publishedAt: publishedAt ? new Date(publishedAt) : null,
          publish: false,
          submitForReview: submitForReview ?? false,
        });
        return serializePostWithQueue(r.workspace, post);
      }),
  );

  server.registerTool(
    "update_post",
    {
      title: "Update post",
      description:
        "Updates titles/content of one or more translations (partial). Set a locale to null to remove that translation.",
      inputSchema: z.object({
        workspace: workspaceArg,
        id: z.string(),
        translations: z
          .record(
            z.string(),
            z
              .object({
                title: z.string().min(1).max(200).optional(),
                contentMd: z.string().max(100_000).optional(),
              })
              .nullable(),
          )
          .optional(),
        publishedAt: z.string().datetime({ offset: true }).nullable().optional(),
        expectedVersion: z
          .number()
          .int()
          .optional()
          .describe(
            "Version from your last read; the update fails if someone changed the post since",
          ),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ workspace, id, translations, publishedAt, expectedVersion }) =>
      guarded(async () => {
        const r = await resolve(workspace);
        const post = await updatePost(
          r.ctx,
          id,
          {
            translations,
            publishedAt:
              publishedAt === undefined ? undefined : publishedAt ? new Date(publishedAt) : null,
          },
          { expectedVersion },
        );
        return serializePost(r.workspace, post);
      }),
  );

  server.registerTool(
    "set_translation",
    {
      title: "Set translation",
      description:
        "Creates or replaces the translation of a post in one language (e.g. translate the English version to Spanish).",
      inputSchema: z.object({
        workspace: workspaceArg,
        id: z.string(),
        locale: z.string().describe("Locale code, e.g. es"),
        title: z.string().min(1).max(200),
        contentMd: z.string().max(100_000),
        expectedVersion: z.number().int().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ workspace, id, locale, title, contentMd, expectedVersion }) =>
      guarded(async () => {
        const r = await resolve(workspace);
        return serializePost(
          r.workspace,
          await setTranslation(r.ctx, id, locale, { title, contentMd }, { expectedVersion }),
        );
      }),
  );

  server.registerTool(
    "publish_post",
    {
      title: "Publish post",
      description:
        "Publishes a post (at its planned publication date if one is set, otherwise now). Use schedule_post for a specific future date. If integrations may not publish in this workspace, the post goes to the review queue instead (`status: in_review`, with `adminUrl` and `pendingReviewCount`).",
      inputSchema: z.object({
        workspace: workspaceArg,
        id: z.string(),
        expectedVersion: z.number().int().optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ workspace, id, expectedVersion }) =>
      guarded(async () => {
        const r = await resolve(workspace);
        return serializePostWithQueue(
          r.workspace,
          await publishPost(r.ctx, id, { expectedVersion }),
        );
      }),
  );

  server.registerTool(
    "schedule_post",
    {
      title: "Schedule post",
      description:
        "Schedules a post to go live at a future date. If integrations may not publish, it goes to the review queue with that date instead.",
      inputSchema: z.object({
        workspace: workspaceArg,
        id: z.string(),
        publishAt: z.string().datetime({ offset: true }),
        expectedVersion: z.number().int().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ workspace, id, publishAt, expectedVersion }) =>
      guarded(async () => {
        const r = await resolve(workspace);
        return serializePostWithQueue(
          r.workspace,
          await schedulePost(r.ctx, id, publishAt, { expectedVersion }),
        );
      }),
  );

  server.registerTool(
    "request_review",
    {
      title: "Send to review",
      description:
        "Sends a draft to the review queue so a human approves and publishes it from the dashboard. Returns `adminUrl` (link to review it) and `pendingReviewCount` (posts waiting in total).",
      inputSchema: z.object({
        workspace: workspaceArg,
        id: z.string(),
        publishAt: z
          .string()
          .datetime({ offset: true })
          .optional()
          .describe("When it should go out once approved (default: as soon as it is approved)"),
        expectedVersion: z.number().int().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ workspace, id, publishAt, expectedVersion }) =>
      guarded(async () => {
        const r = await resolve(workspace);
        return serializePostWithQueue(
          r.workspace,
          await requestReview(r.ctx, id, { at: publishAt ?? null, expectedVersion }),
        );
      }),
  );

  server.registerTool(
    "unpublish_post",
    {
      title: "Unpublish post",
      description: "Turns a published or scheduled post back into a draft.",
      inputSchema: z.object({
        workspace: workspaceArg,
        id: z.string(),
        expectedVersion: z.number().int().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ workspace, id, expectedVersion }) =>
      guarded(async () => {
        const r = await resolve(workspace);
        return serializePost(r.workspace, await unpublishPost(r.ctx, id, { expectedVersion }));
      }),
  );

  server.registerTool(
    "delete_post",
    {
      title: "Delete post",
      description: "Deletes a post. Confirm with the user first.",
      inputSchema: z.object({
        workspace: workspaceArg,
        id: z.string(),
        expectedVersion: z.number().int().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ workspace, id, expectedVersion }) =>
      guarded(async () => {
        const r = await resolve(workspace);
        await deletePost(r.ctx, id, { expectedVersion });
        return { deleted: true, id };
      }),
  );

  server.registerTool(
    "preview_markdown",
    {
      title: "Preview Markdown",
      description:
        "Renders Markdown to HTML exactly like the public page (to check categories, embeds…).",
      inputSchema: z.object({
        workspace: workspaceArg,
        markdown: z.string().max(100_000),
        locale: z.string().optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ workspace, markdown, locale }) =>
      guarded(async () => {
        const r = await resolve(workspace);
        const cats = await listCategories(db, r.workspace.id);
        const loc = locale ?? r.workspace.defaultLocale;
        const out = await renderMarkdown(markdown, {
          categories: cats.map((c) => ({
            id: c.id,
            name: c.names[loc] ?? c.names[r.workspace.defaultLocale] ?? "",
            color: c.color,
          })),
        });
        return { html: out.html, excerpt: out.excerpt, categoryIds: out.categoryIds };
      }),
  );

  /* ---------------- categories ---------------- */

  server.registerTool(
    "list_categories",
    {
      title: "List categories",
      description: "Categories with their names per language and color.",
      inputSchema: z.object({ workspace: workspaceArg }),
      annotations: { readOnlyHint: true },
    },
    async ({ workspace }) =>
      guarded(async () => {
        const r = await resolve(workspace);
        return { items: (await listCategories(db, r.workspace.id)).map(serializeCategory) };
      }),
  );

  server.registerTool(
    "create_category",
    {
      title: "Create category",
      description: "Creates a category. `names` maps locale → name.",
      inputSchema: z.object({
        workspace: workspaceArg,
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .describe("Hex color like #3778FF"),
        names: z.record(z.string(), z.string().min(1).max(40)),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ workspace, color, names }) =>
      guarded(async () => {
        const r = await resolve(workspace);
        return serializeCategory(await createCategory(r.ctx, { color, names }));
      }),
  );

  /* ---------------- images ---------------- */

  server.registerTool(
    "upload_image",
    {
      title: "Upload image",
      description:
        "Uploads an image (from a public URL or base64 data) and returns its URL to use in Markdown as ![alt](url).",
      inputSchema: z.object({
        workspace: workspaceArg,
        url: z.string().url().optional().describe("Public image URL to import"),
        base64: z.string().optional().describe("Base64-encoded image bytes"),
        mimeType: z.string().optional().describe("Required with base64, e.g. image/png"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ workspace, url, base64, mimeType }) =>
      guarded(async () => {
        const r = await resolve(workspace);
        let input: { bytes: Buffer; mime: string };
        if (url) input = await fetchPublicUrl(url, 10 * 1024 * 1024);
        else if (base64 && mimeType)
          input = { bytes: Buffer.from(base64, "base64"), mime: mimeType };
        else throw new AppError("validation", "Provide `url`, or `base64` with `mimeType`");
        const asset = await storeImage(r.ctx, { ...input, folder: "images" });
        return {
          url: asset.url,
          width: asset.width,
          height: asset.height,
          markdown: `![](${asset.url})`,
        };
      }),
  );

  /* ---------------- widget ---------------- */

  server.registerTool(
    "get_widget_settings",
    {
      title: "Get widget settings",
      description: "Widget behaviour settings and the embed snippet to paste in a website.",
      inputSchema: z.object({ workspace: workspaceArg }),
      annotations: { readOnlyHint: true },
    },
    async ({ workspace }) =>
      guarded(async () => {
        const r = await resolve(workspace);
        const w = await getWidgetSettings(db, r.workspace.id);
        return {
          accentColor: w.accentColor,
          badgeDelay: w.badgeDelay,
          entriesLimit: w.entriesLimit,
          expireAfterDays: w.expireAfterDays,
          softHide: w.softHide,
          eyecatcher: w.eyecatcher,
          metaPosition: w.metaPosition,
          stickyFooter: w.stickyFooter,
          uiStrings: w.uiStrings,
          snippet: `<script>\n  var HW_config = { selector: ".featherlog-badge", account: "${r.workspace.publicId}" };\n</script>\n<script async src="${env.WIDGET_URL}/widget.js"></script>`,
        };
      }),
  );

  server.registerTool(
    "update_widget_settings",
    {
      title: "Update widget settings",
      description:
        "Changes widget behaviour and layout (badge delay, entries shown, eyecatcher, meta position, sticky footer…).",
      inputSchema: z.object({
        workspace: workspaceArg,
        accentColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .nullable()
          .optional(),
        badgeDelay: z.number().int().min(0).max(60).optional(),
        entriesLimit: z.number().int().min(1).max(20).optional(),
        expireAfterDays: z.number().int().min(1).max(365).nullable().optional(),
        softHide: z.boolean().optional(),
        eyecatcher: z.enum(["off", "on", "progressive"]).optional(),
        metaPosition: z
          .enum(["above", "below"])
          .optional()
          .describe("Category chips and date above or below the title"),
        stickyFooter: z
          .boolean()
          .optional()
          .describe("Keep the 'see all updates' footer always visible"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ workspace, ...patch }) =>
      guarded(async () => {
        const r = await resolve(workspace);
        const w = await updateWidgetSettings(r.ctx, patch);
        return {
          ok: true,
          eyecatcher: w.eyecatcher,
          entriesLimit: w.entriesLimit,
          badgeDelay: w.badgeDelay,
        };
      }),
  );

  /* ---------------- resources ---------------- */

  server.registerResource(
    "markdown-guide",
    "featherlog://guide/markdown",
    {
      title: "Featherlog Markdown guide",
      description: "Supported syntax: categories, video embeds, image sizing…",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: MARKDOWN_GUIDE }],
    }),
  );

  server.registerResource(
    "workspace",
    "featherlog://workspace",
    {
      title: "Workspace overview",
      description: "Languages, categories and the latest posts",
      mimeType: "application/json",
    },
    async (uri) => {
      // Users with several workspaces get the list (then pass `workspace` to the tools).
      if (principal.kind === "user") {
        const rows = await listUserWorkspaces(db, principal.userId);
        if (rows.length !== 1) {
          const list = {
            workspaces: rows.map((w) => ({
              slug: w.workspace.slug,
              name: w.workspace.name,
              role: w.role,
            })),
          };
          return {
            contents: [
              { uri: uri.href, mimeType: "application/json", text: JSON.stringify(list, null, 2) },
            ],
          };
        }
      }
      const r = await resolve(undefined);
      const [cats, recent] = await Promise.all([
        listCategories(db, r.workspace.id),
        listPosts(r.ctx, { limit: 10 }),
      ]);
      const data = {
        workspace: serializeWorkspace(r.workspace),
        categories: cats.map(serializeCategory),
        recentPosts: recent.items.map((p) => ({
          id: p.id,
          status: p.status,
          titles: Object.fromEntries(Object.entries(p.translations).map(([l, t]) => [l, t.title])),
        })),
      };
      return {
        contents: [
          { uri: uri.href, mimeType: "application/json", text: JSON.stringify(data, null, 2) },
        ],
      };
    },
  );

  /* ---------------- prompts ---------------- */

  server.registerPrompt(
    "release_notes_from_changes",
    {
      title: "Release notes from changes",
      description: "Turn commits, PR titles or a diff summary into a changelog draft.",
      argsSchema: z.object({
        changes: z.string().describe("Commits, PR titles or notes describing what changed"),
        audience: z.string().optional().describe("Who reads the changelog (default: end users)"),
      }),
    },
    ({ changes, audience }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Write a Featherlog changelog post for ${audience ?? "end users"} from these changes. Skip internal refactors and chores; explain the benefit in plain language. Use get_workspace to pick existing categories (label with e.g. [New] / [Improvement] / [Fix] on its own paragraph) and the enabled languages, then create_post as a draft with a translation for each language. Show me the result and ask before publishing.\n\nChanges:\n${changes}`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "translate_post",
    {
      title: "Translate post",
      description: "Translate a post into every enabled language that is missing.",
      argsSchema: z.object({ id: z.string().describe("Post id") }),
    },
    ({ id }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Use get_post to read post ${id} and get_workspace to see enabled languages and category names per language. For every enabled language without a translation, translate the title and content (keep Markdown, links, images and videos intact; replace [Category] markers with the category name in the target language) and save it with set_translation, passing expectedVersion.`,
          },
        },
      ],
    }),
  );

  return server;
}

import {
  type Actor,
  AppError,
  CreateCategoryInput,
  type Ctx,
  createCategory,
  createPost,
  deleteCategory,
  deletePost,
  deleteTranslation,
  getPost,
  getWidgetSettings,
  getWorkspace,
  InviteInput,
  inviteMember,
  isAppError,
  LOCALES,
  listCategories,
  listMembers,
  listPosts,
  publishPost,
  rerenderWorkspacePosts,
  SCOPES,
  schedulePost,
  setTranslation,
  TERMINOLOGY,
  UpdateCategoryInput,
  unpublishPost,
  updateCategory,
  updatePost,
  updateWidgetSettings,
  updateWorkspace,
  verifyApiKey,
  type Workspace,
  withIdempotency,
} from "@featherlog/core";
import { renderMarkdown } from "@featherlog/markdown";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { cors } from "hono/cors";
import { ZodError } from "zod";
import { db } from "@/lib/db";
import { invitationEmail } from "@/lib/emails";
import { env } from "@/lib/env";
import { storeImage, UploadError } from "@/lib/images";
import { logger } from "@/lib/logger";
import { sendMailSafe } from "@/lib/mailer";
import { appUrl } from "@/lib/urls";
import { memoryRateLimiter } from "./rate-limit";
import {
  etagOf,
  expectedVersionFrom,
  serializeCategory,
  serializePost,
  serializeWorkspace,
} from "./serializers";
import { fetchPublicUrl } from "./ssrf";

type Vars = { ctx: Ctx; workspace: Workspace; principal: string };
type Env = { Variables: Vars };

const limiter = memoryRateLimiter(120, 60_000);

/* ------------------------------------------------------------------ */
/* Errors (RFC 9457 problem+json)                                      */
/* ------------------------------------------------------------------ */

function problem(
  status: number,
  code: string,
  detail: string,
  extra: Record<string, unknown> = {},
) {
  const titles: Record<number, string> = {
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    409: "Conflict",
    412: "Precondition Failed",
    413: "Payload Too Large",
    422: "Unprocessable Content",
    428: "Precondition Required",
    429: "Too Many Requests",
    500: "Internal Server Error",
  };
  return new Response(
    JSON.stringify({
      type: `https://featherlog.dev/errors/${code}`,
      title: titles[status] ?? "Error",
      status,
      detail,
      code,
      ...extra,
    }),
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

function zodProblem(err: ZodError) {
  return problem(422, "validation", err.issues[0]?.message ?? "Invalid request", {
    errors: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  });
}

/* ------------------------------------------------------------------ */
/* Schemas (OpenAPI)                                                   */
/* ------------------------------------------------------------------ */

const Problem = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number(),
    detail: z.string(),
    code: z.string(),
  })
  .openapi("Problem");

const TranslationOut = z.object({
  title: z.string(),
  slug: z.string(),
  contentMd: z.string(),
  contentHtml: z.string(),
  excerpt: z.string(),
  url: z.string().nullable().openapi({ description: "Public URL (only when published)" }),
});

const PostOut = z
  .object({
    id: z.string(),
    publicId: z.string(),
    status: z.enum(["draft", "scheduled", "published"]),
    published: z.boolean(),
    publishedAt: z.string().nullable(),
    author: z.object({ id: z.string(), name: z.string() }).nullable(),
    createdVia: z.string(),
    actorLabel: z.string().nullable(),
    version: z
      .number()
      .openapi({ description: "Incremented on every change. Also returned as the ETag." }),
    categoryIds: z.array(z.string()),
    createdAt: z.string(),
    updatedAt: z.string(),
    translations: z.record(z.string(), TranslationOut),
  })
  .openapi("Post");

const CategoryOut = z
  .object({
    id: z.string(),
    color: z.string(),
    position: z.number(),
    names: z.record(z.string(), z.string()),
  })
  .openapi("Category");

const WorkspaceOut = z
  .object({
    id: z.string(),
    publicId: z.string().openapi({ description: "Account id used in the widget snippet" }),
    slug: z.string(),
    name: z.string(),
    url: z.string(),
    websiteUrl: z.string().nullable(),
    logoUrl: z.string().nullable(),
    accentColor: z.string(),
    terminology: z.string(),
    defaultLocale: z.string(),
    locales: z.array(z.string()),
    missingTranslation: z.string(),
    showAuthors: z.boolean(),
    noindex: z.boolean(),
    privateMode: z.boolean(),
    whitelabel: z.boolean(),
    integrationsCanPublish: z.boolean(),
  })
  .openapi("Workspace");

const TranslationIn = z.object({
  title: z.string().min(1).max(200),
  contentMd: z.string().max(100_000).default("").openapi({
    description:
      "Markdown. Inline categories: a paragraph like `[New]` labels the post. Video URLs on their own line are embedded.",
  }),
});

const CreatePostBody = z
  .object({
    translations: z.record(z.string(), TranslationIn).openapi({
      example: {
        en: { title: "Dark mode", contentMd: "[New]\n\nSwitch themes from your profile." },
      },
    }),
    publishedAt: z.string().datetime({ offset: true }).nullable().optional(),
    publish: z.boolean().default(false).openapi({
      description:
        "Publish right away (requires `posts:publish` and the workspace setting allowing integrations to publish).",
    }),
    authorId: z.string().nullable().optional(),
  })
  .openapi("CreatePost");

const UpdatePostBody = z
  .object({
    translations: z
      .record(z.string(), TranslationIn.partial().nullable())
      .optional()
      .openapi({ description: "`null` removes a translation." }),
    publishedAt: z.string().datetime({ offset: true }).nullable().optional(),
    authorId: z.string().nullable().optional(),
  })
  .openapi("UpdatePost");

const IdParam = z.object({
  id: z
    .string()
    .openapi({ param: { name: "id", in: "path" }, description: "Post id or public id" }),
});
const IfMatch = z.object({
  "if-match": z.string().optional().openapi({
    description:
      'ETag from a previous response (e.g. `W/"abc-v3"`). Rejects with 412 if the post changed.',
  }),
});
const IdemHeader = z.object({
  "idempotency-key": z.string().max(200).optional().openapi({
    description:
      "Retries with the same key return the original response instead of repeating the action.",
  }),
});

const errorResponses = {
  401: {
    description: "Missing or invalid API key",
    content: { "application/problem+json": { schema: Problem } },
  },
  403: {
    description: "Missing scope or forbidden by workspace settings",
    content: { "application/problem+json": { schema: Problem } },
  },
  404: { description: "Not found", content: { "application/problem+json": { schema: Problem } } },
  422: {
    description: "Validation error",
    content: { "application/problem+json": { schema: Problem } },
  },
};
const json = <T extends z.ZodType>(schema: T, description = "OK") => ({
  description,
  content: { "application/json": { schema } },
});

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */

export const api = new OpenAPIHono<Env>({
  defaultHook: (result) => {
    if (!result.success) return zodProblem(result.error as unknown as ZodError);
  },
}).basePath("/api/v1");

api.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Authorization", "Content-Type", "Idempotency-Key", "If-Match"],
    exposeHeaders: [
      "ETag",
      "RateLimit-Limit",
      "RateLimit-Remaining",
      "RateLimit-Reset",
      "Idempotent-Replayed",
    ],
  }),
);

api.onError((err) => {
  if (isAppError(err))
    return problem(err.status, err.code, err.message, err.details ? { details: err.details } : {});
  if (err instanceof ZodError) return zodProblem(err);
  if (err instanceof UploadError) return problem(422, "validation", err.message);
  logger.error({ err }, "api error");
  return problem(500, "internal", "Unexpected error");
});

api.notFound(() => problem(404, "not_found", "Unknown endpoint"));

// Authentication: `Authorization: Bearer fl_live_…` (workspace API key).
api.use("*", async (c, next) => {
  if (c.req.path.endsWith("/openapi.json")) return next();
  const header = c.req.header("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token)
    return problem(401, "unauthorized", "Provide an API key: `Authorization: Bearer fl_live_…`");
  const verified = await verifyApiKey(db, token);
  if (!verified) return problem(401, "unauthorized", "Invalid, expired or revoked API key");
  const rl = limiter.hit(verified.apiKeyId);
  c.header("RateLimit-Limit", String(rl.limit));
  c.header("RateLimit-Remaining", String(rl.remaining));
  c.header("RateLimit-Reset", String(rl.resetSeconds));
  if (!rl.allowed) return problem(429, "rate_limited", "Too many requests, slow down");
  const workspace = await getWorkspace(db, verified.workspaceId);
  c.set("workspace", workspace);
  c.set("principal", `key:${verified.apiKeyId}`);
  c.set("ctx", { db, workspaceId: workspace.id, actor: verified.actor as Actor, via: "api" });
  await next();
});

/** Wraps a mutating handler with `Idempotency-Key` support. */
// Typed as `never` so it satisfies each route's declared response (201/200).
async function idempotent(
  c: Context<Env>,
  body: unknown,
  run: () => Promise<{ status: number; body: unknown }>,
): Promise<never> {
  const key = c.req.header("idempotency-key");
  if (!key) {
    const r = await run();
    return c.json(r.body as object, r.status as 200) as never;
  }
  const r = await withIdempotency(
    db,
    c.get("principal"),
    key,
    `${c.req.method} ${c.req.path} ${JSON.stringify(body ?? null)}`,
    run,
  );
  if (r.replayed) c.header("Idempotent-Replayed", "true");
  return c.json(r.body as object, r.status as 200) as never;
}

const ws = (c: Context<Env>) => c.get("workspace");
const ctx = (c: Context<Env>) => c.get("ctx");
const toDate = (v: string | null | undefined) =>
  v === undefined ? undefined : v === null ? null : new Date(v);

/* ---------- workspace ---------- */

api.openapi(
  createRoute({
    method: "get",
    path: "/workspace",
    tags: ["Workspace"],
    summary: "Get the workspace",
    responses: { 200: json(WorkspaceOut), ...errorResponses },
  }),
  async (c) => c.json(serializeWorkspace(await getWorkspace(db, ws(c).id)), 200),
);

api.openapi(
  createRoute({
    method: "patch",
    path: "/workspace",
    tags: ["Workspace"],
    summary: "Update workspace settings",
    description: "Requires `settings:write`.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                name: z.string(),
                accentColor: z.string(),
                terminology: z.enum(TERMINOLOGY),
                websiteUrl: z.string().nullable(),
                showAuthors: z.boolean(),
                noindex: z.boolean(),
                privateMode: z.boolean(),
                whitelabel: z.boolean(),
                defaultLocale: z.string(),
                locales: z.array(z.string()),
                missingTranslation: z.enum(["fallback", "hide"]),
              })
              .partial()
              .openapi("UpdateWorkspace"),
          },
        },
      },
    },
    responses: { 200: json(WorkspaceOut), ...errorResponses },
  }),
  async (c) => c.json(serializeWorkspace(await updateWorkspace(ctx(c), c.req.valid("json"))), 200),
);

api.openapi(
  createRoute({
    method: "get",
    path: "/locales",
    tags: ["Workspace"],
    summary: "Supported and enabled locales",
    responses: {
      200: json(
        z.object({
          defaultLocale: z.string(),
          enabled: z.array(z.string()),
          supported: z.array(
            z.object({
              code: z.string(),
              name: z.string(),
              nativeName: z.string(),
              dir: z.string(),
            }),
          ),
        }),
      ),
      ...errorResponses,
    },
  }),
  async (c) =>
    c.json({ defaultLocale: ws(c).defaultLocale, enabled: ws(c).locales, supported: LOCALES }, 200),
);

/* ---------- posts ---------- */

api.openapi(
  createRoute({
    method: "get",
    path: "/posts",
    tags: ["Posts"],
    summary: "List posts",
    description: "Newest first. Paginate with `cursor` (`nextCursor` from the previous page).",
    request: {
      query: z.object({
        status: z.enum(["all", "draft", "scheduled", "published"]).optional(),
        locale: z.string().optional(),
        missingLocale: z
          .string()
          .optional()
          .openapi({ description: "Only posts without a translation in this locale" }),
        categoryId: z.string().optional(),
        q: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
      }),
    },
    responses: {
      200: json(z.object({ items: z.array(PostOut), nextCursor: z.string().nullable() })),
      ...errorResponses,
    },
  }),
  async (c) => {
    const page = await listPosts(ctx(c), c.req.valid("query"));
    return c.json(
      { items: page.items.map((p) => serializePost(ws(c), p)), nextCursor: page.nextCursor },
      200,
    );
  },
);

api.openapi(
  createRoute({
    method: "post",
    path: "/posts",
    tags: ["Posts"],
    summary: "Create a post",
    description:
      "Creates a draft by default. Requires `posts:write` (and `posts:publish` with `publish: true`).",
    request: {
      headers: IdemHeader,
      body: { content: { "application/json": { schema: CreatePostBody } } },
    },
    responses: { 201: json(PostOut, "Created"), ...errorResponses },
  }),
  async (c) => {
    const body = c.req.valid("json");
    return idempotent(c, body, async () => {
      const post = await createPost(ctx(c), { ...body, publishedAt: toDate(body.publishedAt) });
      return { status: 201, body: serializePost(ws(c), post) };
    });
  },
);

api.openapi(
  createRoute({
    method: "get",
    path: "/posts/{id}",
    tags: ["Posts"],
    summary: "Get a post",
    request: { params: IdParam },
    responses: { 200: json(PostOut), ...errorResponses },
  }),
  async (c) => {
    const post = await getPost(ctx(c), c.req.valid("param").id);
    c.header("ETag", etagOf(post));
    return c.json(serializePost(ws(c), post), 200);
  },
);

api.openapi(
  createRoute({
    method: "patch",
    path: "/posts/{id}",
    tags: ["Posts"],
    summary: "Update a post",
    description: "Partial update. Send `If-Match` to avoid overwriting concurrent edits.",
    request: {
      params: IdParam,
      headers: IfMatch,
      body: { content: { "application/json": { schema: UpdatePostBody } } },
    },
    responses: {
      200: json(PostOut),
      412: {
        description: "The post changed since your ETag",
        content: { "application/problem+json": { schema: Problem } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const post = await updatePost(
      ctx(c),
      c.req.valid("param").id,
      { ...body, publishedAt: toDate(body.publishedAt) },
      { expectedVersion: expectedVersionFrom(c.req.header("if-match")) },
    );
    c.header("ETag", etagOf(post));
    return c.json(serializePost(ws(c), post), 200);
  },
);

api.openapi(
  createRoute({
    method: "delete",
    path: "/posts/{id}",
    tags: ["Posts"],
    summary: "Delete a post",
    request: { params: IdParam, headers: IfMatch },
    responses: { 204: { description: "Deleted" }, ...errorResponses },
  }),
  async (c) => {
    await deletePost(ctx(c), c.req.valid("param").id, {
      expectedVersion: expectedVersionFrom(c.req.header("if-match")),
    });
    return c.body(null, 204);
  },
);

api.openapi(
  createRoute({
    method: "put",
    path: "/posts/{id}/translations/{locale}",
    tags: ["Posts"],
    summary: "Create or replace a translation",
    request: {
      params: IdParam.extend({
        locale: z.string().openapi({ param: { name: "locale", in: "path" }, example: "es" }),
      }),
      headers: IfMatch,
      body: { content: { "application/json": { schema: TranslationIn } } },
    },
    responses: { 200: json(PostOut), ...errorResponses },
  }),
  async (c) => {
    const { id, locale } = c.req.valid("param");
    const post = await setTranslation(ctx(c), id, locale, c.req.valid("json"), {
      expectedVersion: expectedVersionFrom(c.req.header("if-match")),
    });
    c.header("ETag", etagOf(post));
    return c.json(serializePost(ws(c), post), 200);
  },
);

api.openapi(
  createRoute({
    method: "delete",
    path: "/posts/{id}/translations/{locale}",
    tags: ["Posts"],
    summary: "Remove a translation",
    request: {
      params: IdParam.extend({
        locale: z.string().openapi({ param: { name: "locale", in: "path" } }),
      }),
      headers: IfMatch,
    },
    responses: { 200: json(PostOut), ...errorResponses },
  }),
  async (c) => {
    const { id, locale } = c.req.valid("param");
    const post = await deleteTranslation(ctx(c), id, locale, {
      expectedVersion: expectedVersionFrom(c.req.header("if-match")),
    });
    c.header("ETag", etagOf(post));
    return c.json(serializePost(ws(c), post), 200);
  },
);

const publishDescription =
  "Requires `posts:publish`. Integrations can only publish when the workspace enables “Integrations can publish” (Settings → API).";

api.openapi(
  createRoute({
    method: "post",
    path: "/posts/{id}/publish",
    tags: ["Posts"],
    summary: "Publish a post",
    description: publishDescription,
    request: {
      params: IdParam,
      headers: IdemHeader.merge(IfMatch),
      body: {
        required: false,
        content: {
          "application/json": {
            schema: z.object({ at: z.string().datetime({ offset: true }).optional() }),
          },
        },
      },
    },
    responses: { 200: json(PostOut), ...errorResponses },
  }),
  async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { at?: string };
    return idempotent(c, body, async () => {
      const post = await publishPost(ctx(c), c.req.valid("param").id, {
        at: body.at ?? null,
        expectedVersion: expectedVersionFrom(c.req.header("if-match")),
      });
      c.header("ETag", etagOf(post));
      return { status: 200, body: serializePost(ws(c), post) };
    });
  },
);

api.openapi(
  createRoute({
    method: "post",
    path: "/posts/{id}/schedule",
    tags: ["Posts"],
    summary: "Schedule a post",
    description: `Publishes at a future date. ${publishDescription}`,
    request: {
      params: IdParam,
      headers: IdemHeader.merge(IfMatch),
      body: {
        content: {
          "application/json": {
            schema: z.object({ publishAt: z.string().datetime({ offset: true }) }),
          },
        },
      },
    },
    responses: { 200: json(PostOut), ...errorResponses },
  }),
  async (c) => {
    const body = c.req.valid("json");
    return idempotent(c, body, async () => {
      const post = await schedulePost(ctx(c), c.req.valid("param").id, body.publishAt, {
        expectedVersion: expectedVersionFrom(c.req.header("if-match")),
      });
      c.header("ETag", etagOf(post));
      return { status: 200, body: serializePost(ws(c), post) };
    });
  },
);

api.openapi(
  createRoute({
    method: "post",
    path: "/posts/{id}/unpublish",
    tags: ["Posts"],
    summary: "Unpublish a post",
    description: publishDescription,
    request: { params: IdParam, headers: IfMatch },
    responses: { 200: json(PostOut), ...errorResponses },
  }),
  async (c) => {
    const post = await unpublishPost(ctx(c), c.req.valid("param").id, {
      expectedVersion: expectedVersionFrom(c.req.header("if-match")),
    });
    c.header("ETag", etagOf(post));
    return c.json(serializePost(ws(c), post), 200);
  },
);

api.openapi(
  createRoute({
    method: "post",
    path: "/preview",
    tags: ["Posts"],
    summary: "Render Markdown",
    description:
      "Renders Markdown exactly as the public page would (categories, video embeds, sizing).",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({ markdown: z.string().max(100_000), locale: z.string().optional() }),
          },
        },
      },
    },
    responses: {
      200: json(
        z.object({ html: z.string(), excerpt: z.string(), categoryIds: z.array(z.string()) }),
      ),
      ...errorResponses,
    },
  }),
  async (c) => {
    const { markdown, locale } = c.req.valid("json");
    const cats = await listCategories(db, ws(c).id);
    const loc = locale ?? ws(c).defaultLocale;
    const r = await renderMarkdown(markdown, {
      categories: cats.map((x) => ({
        id: x.id,
        name: x.names[loc] ?? x.names[ws(c).defaultLocale] ?? "",
        color: x.color,
      })),
    });
    return c.json({ html: r.html, excerpt: r.excerpt, categoryIds: r.categoryIds }, 200);
  },
);

/* ---------- categories ---------- */

api.openapi(
  createRoute({
    method: "get",
    path: "/categories",
    tags: ["Categories"],
    summary: "List categories",
    responses: { 200: json(z.object({ items: z.array(CategoryOut) })), ...errorResponses },
  }),
  async (c) => c.json({ items: (await listCategories(db, ws(c).id)).map(serializeCategory) }, 200),
);

api.openapi(
  createRoute({
    method: "post",
    path: "/categories",
    tags: ["Categories"],
    summary: "Create a category",
    description: "Requires `categories:write`. `names` maps locale → name.",
    request: {
      headers: IdemHeader,
      body: { content: { "application/json": { schema: CreateCategoryInput } } },
    },
    responses: { 201: json(CategoryOut, "Created"), ...errorResponses },
  }),
  async (c) => {
    const body = c.req.valid("json");
    return idempotent(c, body, async () => ({
      status: 201,
      body: serializeCategory(await createCategory(ctx(c), body)),
    }));
  },
);

api.openapi(
  createRoute({
    method: "patch",
    path: "/categories/{categoryId}",
    tags: ["Categories"],
    summary: "Update a category",
    request: {
      params: z.object({
        categoryId: z.string().openapi({ param: { name: "categoryId", in: "path" } }),
      }),
      body: { content: { "application/json": { schema: UpdateCategoryInput } } },
    },
    responses: { 200: json(CategoryOut), ...errorResponses },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const cat = await updateCategory(ctx(c), c.req.valid("param").categoryId, body);
    if (body.names) await rerenderWorkspacePosts(db, ws(c).id);
    return c.json(serializeCategory(cat), 200);
  },
);

api.openapi(
  createRoute({
    method: "delete",
    path: "/categories/{categoryId}",
    tags: ["Categories"],
    summary: "Delete a category",
    request: {
      params: z.object({
        categoryId: z.string().openapi({ param: { name: "categoryId", in: "path" } }),
      }),
    },
    responses: { 204: { description: "Deleted" }, ...errorResponses },
  }),
  async (c) => {
    await deleteCategory(ctx(c), c.req.valid("param").categoryId);
    return c.body(null, 204);
  },
);

/* ---------- assets ---------- */

api.openapi(
  createRoute({
    method: "post",
    path: "/assets",
    tags: ["Assets"],
    summary: "Upload an image",
    description:
      'Send `multipart/form-data` with a `file` field, or JSON `{ "url": "https://…" }` to import a public image. Returns a URL to use in Markdown: `![alt](url)`. Requires `assets:write`.',
    request: {
      body: {
        content: {
          "multipart/form-data": {
            schema: z.object({ file: z.any().openapi({ type: "string", format: "binary" }) }),
          },
          "application/json": { schema: z.object({ url: z.string().url() }) },
        },
      },
    },
    responses: {
      201: json(
        z.object({
          id: z.string(),
          url: z.string(),
          width: z.number().nullable(),
          height: z.number().nullable(),
          mime: z.string(),
        }),
        "Created",
      ),
      ...errorResponses,
    },
  }),
  async (c) => {
    const type = c.req.header("content-type") ?? "";
    let input: { bytes: Buffer; mime: string };
    if (type.includes("multipart/form-data")) {
      const form = await c.req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new AppError("validation", "Missing `file` field");
      input = { bytes: Buffer.from(await file.arrayBuffer()), mime: file.type };
    } else {
      const body = (await c.req.json().catch(() => null)) as { url?: string } | null;
      if (!body?.url) throw new AppError("validation", "Send multipart `file` or JSON `{ url }`");
      try {
        input = await fetchPublicUrl(body.url, 10 * 1024 * 1024);
      } catch (err) {
        throw new AppError(
          "validation",
          err instanceof Error ? err.message : "Could not download the image",
        );
      }
    }
    const asset = await storeImage(ctx(c), { ...input, folder: "images" });
    return c.json(
      { id: asset.id, url: asset.url, width: asset.width, height: asset.height, mime: asset.mime },
      201,
    );
  },
);

/* ---------- widget settings ---------- */

const WidgetSettingsOut = z
  .object({
    accentColor: z.string().nullable(),
    badgeDelay: z.number(),
    entriesLimit: z.number(),
    expireAfterDays: z.number().nullable(),
    softHide: z.boolean(),
    eyecatcher: z.enum(["off", "on", "progressive"]),
    metaPosition: z.enum(["above", "below"]),
    stickyFooter: z.boolean(),
    uiStrings: z.record(z.string(), z.record(z.string(), z.string())),
    snippet: z.string(),
  })
  .openapi("WidgetSettings");

function widgetOut(w: Awaited<ReturnType<typeof getWidgetSettings>>, publicId: string) {
  return {
    accentColor: w.accentColor,
    badgeDelay: w.badgeDelay,
    entriesLimit: w.entriesLimit,
    expireAfterDays: w.expireAfterDays,
    softHide: w.softHide,
    eyecatcher: w.eyecatcher as "off" | "on" | "progressive",
    metaPosition: w.metaPosition as "above" | "below",
    stickyFooter: w.stickyFooter,
    uiStrings: w.uiStrings,
    snippet: `<script>\n  var HW_config = { selector: ".featherlog-badge", account: "${publicId}" };\n</script>\n<script async src="${env.WIDGET_URL}/widget.js"></script>`,
  };
}

api.openapi(
  createRoute({
    method: "get",
    path: "/widget-settings",
    tags: ["Widget"],
    summary: "Get widget settings and embed snippet",
    responses: { 200: json(WidgetSettingsOut), ...errorResponses },
  }),
  async (c) => c.json(widgetOut(await getWidgetSettings(db, ws(c).id), ws(c).publicId), 200),
);

api.openapi(
  createRoute({
    method: "patch",
    path: "/widget-settings",
    tags: ["Widget"],
    summary: "Update widget settings",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                accentColor: z.string().nullable(),
                badgeDelay: z.number().int(),
                entriesLimit: z.number().int(),
                expireAfterDays: z.number().int().nullable(),
                softHide: z.boolean(),
                eyecatcher: z.enum(["off", "on", "progressive"]),
                metaPosition: z.enum(["above", "below"]),
                stickyFooter: z.boolean(),
                uiStrings: z.record(z.string(), z.record(z.string(), z.string())),
              })
              .partial()
              .openapi("UpdateWidgetSettings"),
          },
        },
      },
    },
    responses: { 200: json(WidgetSettingsOut), ...errorResponses },
  }),
  async (c) =>
    c.json(
      widgetOut(await updateWidgetSettings(ctx(c), c.req.valid("json") as never), ws(c).publicId),
      200,
    ),
);

/* ---------- members ---------- */

api.openapi(
  createRoute({
    method: "get",
    path: "/members",
    tags: ["Team"],
    summary: "List members",
    responses: {
      200: json(
        z.object({
          items: z.array(
            z.object({ userId: z.string(), name: z.string(), email: z.string(), role: z.string() }),
          ),
        }),
      ),
      ...errorResponses,
    },
  }),
  async (c) => {
    const members = await listMembers(db, ws(c).id);
    return c.json(
      {
        items: members.map((m) => ({
          userId: m.userId,
          name: m.displayName || m.name,
          email: m.email,
          role: m.role,
        })),
      },
      200,
    );
  },
);

api.openapi(
  createRoute({
    method: "post",
    path: "/invitations",
    tags: ["Team"],
    summary: "Invite a member",
    description: "Requires `members:admin`. Sends an invitation email.",
    request: { body: { content: { "application/json": { schema: InviteInput } } } },
    responses: {
      201: json(
        z.object({ id: z.string(), email: z.string(), role: z.string(), expiresAt: z.string() }),
        "Created",
      ),
      ...errorResponses,
    },
  }),
  async (c) => {
    const { invitation, token } = await inviteMember(ctx(c), c.req.valid("json"));
    await sendMailSafe(
      invitationEmail(invitation.email, {
        workspace: ws(c).name,
        inviter: "Featherlog API",
        url: appUrl(`/invite/${token}`),
      }),
    );
    return c.json(
      {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt.toISOString(),
      },
      201,
    );
  },
);

/* ---------- OpenAPI document ---------- */

api.openAPIRegistry.registerComponent("securitySchemes", "apiKey", {
  type: "http",
  scheme: "bearer",
  description: `Workspace API key (Settings → API & MCP). Scopes: ${SCOPES.join(", ")}.`,
});

api.doc31("/openapi.json", () => ({
  openapi: "3.1.0",
  info: {
    title: "Featherlog API",
    version: "1.0.0",
    description:
      "Manage your Featherlog changelog: posts, translations, categories, images and widget settings.\n\nAuthenticate with a workspace API key: `Authorization: Bearer fl_live_…`. Retries are safe with `Idempotency-Key`; concurrent edits are protected with `ETag`/`If-Match`. Errors use RFC 9457 `application/problem+json`.",
  },
  servers: [{ url: env.APP_URL }],
  security: [{ apiKey: [] }],
  tags: [
    { name: "Posts" },
    { name: "Categories" },
    { name: "Assets" },
    { name: "Widget" },
    { name: "Workspace" },
    { name: "Team" },
  ],
}));

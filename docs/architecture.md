# Architecture

Featherlog is a TypeScript monorepo (pnpm workspaces) with one deployable app, `apps/web`, a Next.js server, and a handful of internal packages. All business rules live in `packages/core`. Every entry point (dashboard, REST API, MCP server, public pages, widget) is a thin adapter on top of it.

## Overview

```
                 ┌────────────────────────── apps/web (Next.js, one process) ───────────────────────────┐
 Browser         │                                                                                      │
 (dashboard) ───▶│  /app/*      React Server Components + server actions ──┐                            │
                 │  /api/auth/* Better Auth (sessions, magic links, OAuth 2.1 AS)                       │
 Scripts / CI ──▶│  /api/v1/*   Hono + zod-openapi (API keys) ─────────────┤                            │
                 │                                                         ├──▶ packages/core ──┐       │
 AI agents ─────▶│  /mcp        MCP server (OAuth or API key) ─────────────┤    (domain logic)  │       │
                 │                                                         │                    ▼       │
 Readers ───────▶│  /<slug>/*   public pages, RSS, sitemap (read-only) ────┘             packages/db ───┼──▶ Postgres
                 │                                                                       (Drizzle)     │    (data, outbox,
 Host site ─────▶│  /widget.js  loader (static)                                                         │     pg-boss jobs)
   └─ iframe ───▶│  /_widget/:account   iframe HTML (data inlined, strict CSP)                         │
 Headless ──────▶│  /api/widget/:account  JSON                                                          │
                 │                                                                                      │
                 │  Storage: local volume or S3/R2 ── /uploads/*                                        │
                 │  Jobs: pg-boss (inline) ─── or ─── `worker` process (same image)                     │
                 └──────────────────────────────────────────────────────────────────────────────────────┘
```

## Packages

| Package | Role |
| --- | --- |
| `packages/core` | Domain services: workspaces, posts and translations, categories, members and invitations, API keys, widget settings, public feed, idempotency, permissions (`auth.ts`), entitlements, events. Every function takes a `Ctx` (`db`, `workspaceId`, `actor`, `via`) and checks permissions itself. Errors are `AppError`s with a code, and each adapter maps them to its own format. |
| `packages/db` | Drizzle schema (`schema.ts`, `auth-schema.ts` for Better Auth and OAuth tables), SQL migrations in `drizzle/`, `runMigrations` (advisory-locked), and `createTestDb()` (PGlite in memory, or a throwaway database on `TEST_DATABASE_URL`). |
| `packages/markdown` | Markdown → sanitized HTML with unified/remark/rehype: GFM, `[Category]` markers, video embeds, Headway-style image sizing, syntax highlighting, excerpts. Also exports the user-facing `MARKDOWN_GUIDE`. |
| `packages/widget` | The embeddable widget: `loader.ts` → `widget.js` (badge, popup, Headway-compatible API) and `frame-app.ts` → `frame.js`/`frame.css` (UI inside the iframe), plus the `postMessage` protocol and `frameDocument()`. Built with esbuild. `apps/web` copies the output into `public/`. |
| `packages/mcp` | `@featherlog/mcp` on npm: a stdio ↔ Streamable HTTP bridge to `<APP_URL>/mcp`. It has no tool definitions of its own. |
| `apps/web` | Next.js app (App Router): dashboard, auth, public pages, REST API (`src/server/api`), MCP server (`src/server/mcp`, mounted at `src/app/mcp/route.ts`), widget routes, storage, mailer, job worker (`worker.ts`). |

## Request flows

**Dashboard.** Pages under `/app/[ws]` are server components. Mutations are server actions that resolve the session and the member's role into a `Ctx` with `via: "panel"`, then call core, for example `updatePost(ctx, …)`. The editor sends the post `version` so concurrent edits fail cleanly instead of overwriting each other.

**REST API.** `src/app/api/v1/[...route]/route.ts` forwards to a Hono app. Middleware verifies the API key (`verifyApiKey` → workspace and `api_key` actor with scopes), applies the per-key rate limit and builds a `Ctx` with `via: "api"`. Handlers validate with zod (the same schemas generate the OpenAPI document) and call core. `withIdempotency` wraps creating calls, `If-Match` maps to `expectedVersion`, and `AppError`s become `problem+json`.

**MCP.** `src/app/mcp/route.ts` authenticates either an API key (`fl_live_…`) or an OAuth access token. Better Auth's MCP plugin validates the token audience. It then builds a fresh `McpServer` for that principal. OAuth principals resolve to a `user` actor whose permissions are *role ∩ granted scopes*. Each tool resolves the workspace (via the `workspace` slug argument when the user has several) and calls the same core functions with `via: "mcp"`.

**Public pages.** `/(public)/[slug]/[[...path]]` reads through `getPublicFeed`/`getPublicPost`, which only return posts that are published and due. URLs: `/<slug>`, `/<slug>/<locale>`, `/<slug>/<post-slug>-<publicId>`, `/<slug>/<locale>/<post-slug>-<publicId>`, `?category=<slug>`, `/<slug>/rss[/<locale>]`, `/<slug>/sitemap.xml`. Old slugs redirect (`slug_redirects`).

**Widget.**
1. The host page loads `widget.js`, which is static and CDN-cacheable. It reads `HW_config`, injects the badge and creates a hidden iframe at `/_widget/<account>?lang=…`.
2. The iframe HTML is rendered on the server with all data inlined (`window.__FL__`), so there is no extra request. It is served with a hash-based CSP, so it can be cached for 60 s at the edge.
3. The frame posts `ready` with item ids and dates. The loader compares them with `localStorage` (on the host origin) to compute the unseen count, then sends `init` back with seen and read ids and text overrides. Messages are checked by origin, source window and envelope.
4. `/api/widget/<account>` serves the same data as JSON for headless use.

**Host routing.** `src/proxy.ts` (Next middleware) routes by host when `APP_URL`, `PUBLIC_URL` and `WIDGET_URL` differ. The widget host only serves widget paths, and the public host redirects app paths to `APP_URL`. It also has an extension point for custom domains (`resolveCustomDomain`, which returns `null` for now) and handles private-mode `?t=` tokens.

## Data model

| Table | Notes |
| --- | --- |
| `user`, `session`, `account`, `verification` | Better Auth. `user` adds `displayName`, `jobTitle`, `uiLocale`. |
| `jwks`, `oauth_client`, `oauth_consent`, `oauth_access_token`, `oauth_refresh_token`, … | OAuth 2.1 authorization server for MCP clients. |
| `workspaces` | One changelog: `slug`, `publicId` (widget account id), branding, `defaultLocale`, `locales[]`, `missingTranslation` (`fallback`/`hide`), `privateMode`, `noindex`, `whitelabel`, `integrationsCanPublish`, `customDomain` (reserved). |
| `memberships`, `invitations` | Roles `owner`/`admin`/`editor`. Invitations are stored as token hashes and expire after 14 days. |
| `slug_redirects` | Previous slugs → workspace. |
| `posts` | `publicId`, `published` + `publishedAt` (status is derived: draft / scheduled / published), `authorId`, `createdVia` (`panel`/`api`/`mcp`), `actorLabel`, `version`, soft delete. |
| `post_translations` | One row per (post, locale): `title`, `slug`, `contentMd`, rendered `contentHtml`, `excerpt`, plain `text` for search. |
| `categories`, `category_translations`, `post_categories` | Category color and position. Names per locale. Post ↔ category links are derived from the `[Category]` markers when a post is rendered. |
| `assets` | Uploaded files (storage key, mime, size, dimensions). |
| `widget_settings` | One row per workspace (badge delay, entries limit, expiry, soft hide, eye-catcher, accent, UI string overrides per locale). |
| `api_keys` | Prefix, SHA-256 hash, scopes, expiry, revocation, last use. |
| `idempotency_keys` | (principal, key) → request hash and stored response. Purged daily. |
| `events` | Outbox of domain events. |

Markdown is rendered **when a post is written**, not when it is read. `contentHtml` and categories are stored. Renaming a category re-renders the workspace's posts.

## i18n model

There are two separate concerns:

- **Content languages.** A workspace enables a subset of the supported locales (`packages/core/src/locales.ts`, 15 including RTL Arabic and Hebrew) and picks a default. A post has one translation per locale, and categories have one name per locale. Readers get the requested locale. When a translation is missing, they get the default language with a notice (`fallback`), or the post is hidden in that locale (`hide`). The widget negotiates the locale from `language`, `<html lang>`, or `Accept-Language`. `[Category]` markers match the translation's own names first, then names in other locales.
- **UI languages.** Dashboard strings live in `apps/web/messages/<locale>/*.json` (next-intl, English and Spanish today). Public page and widget strings exist for every supported content locale (`src/lib/public-i18n.ts`), and widget texts can be overridden per locale in widget settings.

## Multi-tenancy and entitlements

Every domain table hangs off `workspaces` and every core query filters by `ctx.workspaceId`. A user can belong to many workspaces with a different role in each. API keys are bound to exactly one workspace.

`packages/core/src/entitlements.ts` defines feature flags (`whitelabel`, `custom_domain`, `team`, `private_mode`, `multiple_locales`, `api`, `scheduled_publishing`) behind a pluggable resolver. Self-hosted, the resolver returns `true` for everything. A future hosted edition can install a plan-based resolver with `setEntitlementsResolver()`, without forking the code.

## Events outbox

Core services append domain events (`post.created`, `post.updated`, `post.published`, `post.unpublished`, `post.deleted`, `workspace.updated`) to the `events` table. This is the foundation for webhooks and integrations, such as Slack notifications, email digests and cache purges. Nothing consumes it yet.

## Background jobs

[pg-boss](https://github.com/timgit/pg-boss) on the same Postgres (schema `pgboss`), started by `src/server/jobs.ts`:

- `WORKER_MODE=inline`: started from `instrumentation.ts` inside the web process.
- `WORKER_MODE=separate`: started by `worker.ts`, bundled to `worker.mjs` and run with the image's `worker` command.

The current job purges idempotency keys daily at 03:17. Scheduling doesn't depend on jobs: status is computed from `publishedAt` at read time, so a scheduled post appears exactly on time without a worker.

## Storage

`src/lib/storage.ts` defines a small interface (`put`, `get`, `delete`, `url`) with two drivers:

- **local**: files under `UPLOADS_DIR`, served by `/uploads/[...key]`.
- **s3**: any S3-compatible service. URLs use `S3_PUBLIC_URL` when it is set, or are proxied through `/uploads/…`.

Keys are `<folder>/<workspaceId>/<random>.<ext>` and are validated against path traversal. Images go through `sharp`: they are decoded (which rejects non-images), auto-rotated, stripped of EXIF, resized and converted to WebP. Animated GIFs are kept.

## Security notes

- **Sanitized Markdown.** Raw HTML is dropped, and the output goes through `rehype-sanitize` with an allowlist. Only `http`/`https`/`mailto` links are allowed, and external links get `rel="noopener noreferrer nofollow"`. Video iframes are only generated for allowlisted providers.
- **Widget isolation.** Post HTML is rendered inside an iframe on the widget origin, never in the host page's DOM. The frame's CSP is `default-src 'none'`, scripts are allowed only by hash and from the widget origin, `connect-src 'none'`, `frame-src` covers only the video providers, `base-uri 'none'` and `form-action 'none'`. `postMessage` traffic is checked in both directions.
- **Dashboard framing.** `/app/*` sends `X-Frame-Options: DENY` and `frame-ancestors 'none'`.
- **SSRF guard.** Image imports by URL (REST and MCP) resolve DNS first and refuse loopback, private, link-local, CGNAT and multicast addresses. Redirects are not followed, and downloads are limited to 10 MB and 10 s (`src/server/api/ssrf.ts`).
- **Signed private links.** In private mode, links from the widget carry `?t=<exp>.<hmac>`, signed with `AUTH_SECRET` and valid for about an hour. The middleware stores the token in an HttpOnly cookie scoped to the changelog path. Workspace members can always read.
- **Secrets at rest.** API keys and invitation tokens are stored as SHA-256 hashes. The API key secret is shown once.
- **Uploads.** Uploaded files are served with `nosniff`. SVGs get a sandboxing CSP.
- **Auth.** Better Auth provides sessions, email verification (required in production), password reset, magic links, and rate limiting in production. Sign-up is governed by `SIGNUP_MODE`.

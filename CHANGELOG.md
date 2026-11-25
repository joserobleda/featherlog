# Changelog

All notable changes to Featherlog are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

### Fixed

- Subscriber CSV import reads the current Brevo export: `_BLOCKLISTED` columns with channel lists (`['email_marketing']`) become opt-outs, and `EXT_ID` is the external id.

- Turning on SMTP no longer locks out accounts created without email verification: a password sign-in now sends the verification link the page promises.
- A sign-in link that was already used or expired now returns to the login page with an explanation, instead of silently looping back to it.

### Added

- Release workflow: a `deploy-coolify` job restarts the Coolify service with the new image after each build. See [Deploying on Coolify](docs/deploy-coolify.md#3-updates).

## [0.2.0] - 2026-11-25

### Added

- **Email subscribers**: a per-workspace subscriber list kept in sync from your app through the REST API (`PUT /subscribers/{externalId}`, `POST /subscribers/batch`, `DELETE`), with sticky opt-outs, language per subscriber and a **Settings → Subscribers** page. Includes a CSV import that detects Brevo/Mailchimp columns and keeps their opt-outs. New `subscribers:read` and `subscribers:write` scopes. First step towards product-update emails.

- **Newsletters**: product-update emails made from the posts published since the last one. Claude writes the draft in every language when `ANTHROPIC_API_KEY` is set (otherwise a basic draft), a person reviews, previews, sends a test and sends it. Throttled, resumable sending through SMTP, unsubscribe links with RFC 8058 one-click headers, per-workspace sender name, reply-to, footer and AI guidance. REST (`/newsletters`) and MCP tools to prepare drafts; only the dashboard sends.
- **Mailgun webhooks** (`/api/webhooks/mailgun`, signed with `MAILGUN_WEBHOOK_SIGNING_KEY`): permanent bounces mark subscribers as bounced and the delivery as failed; spam complaints and unsubscribes opt them out.
- **Identified widget users**: `HW_config.user = { id, hash }`, signed with a per-workspace secret, keeps "seen" in sync across devices and records reads. Newsletter links are tracked per recipient. Newsletters show reads per post and can skip people who already read everything in the app.

## [0.1.0] - Unreleased

First public release.

### Added

- **Dashboard**: workspaces with a Markdown editor (live preview, image paste and drop), drafts, publishing, scheduling, authors and post filters.
- **Public changelog page** per workspace: category filter, post permalinks (`/<slug>/<post>-<id>`), a language switcher, RSS per language, a sitemap, an option to hide from search engines, branding removal, and private mode with signed links.
- **Embeddable widget** compatible with Headway snippets (`HW_config`, `window.Headway`, `#HW_badge`): badge with unseen count, popup or inline (`embed`) mode, `trigger`, `position`, `translations`, callbacks, and a JS API (`init`, `destroy`, `show`, `hide`, `toggle`, `getUnseenCount`, `markAllSeen`). It runs in an isolated iframe with a strict CSP, sets no cookies, and has settings for badge delay, posts shown, count expiry, soft hide, eye-catcher animation and per-language texts. Headless JSON endpoint at `/api/widget/:account`.
- **Native multi-language posts**: one translation per language (15 supported locales, including RTL), a fallback or hide policy for missing translations, automatic language detection in the widget, and translated category names.
- **Categories** set inline in Markdown (`[New] [Fix]`), with colors and ordering. Default New, Improvement and Fix categories.
- **Markdown extras**: YouTube (no-cookie), Vimeo, Loom and Wistia embeds, Headway-style image sizing (`=300x200`), syntax highlighting, and sanitized output.
- **Team**: owner, admin and editor roles, email invitations, and ownership transfer.
- **REST API** (`/api/v1`, OpenAPI 3.1 with an interactive reference at `/api/docs`): workspace API keys with scopes, idempotency keys, ETag/If-Match concurrency control, `problem+json` errors, cursor pagination, a rate limit of 120 requests/min per key, and image import from URLs with an SSRF guard.
- **MCP server** at `/mcp` with OAuth 2.1 (dynamic client registration and CIMD) or API key auth: 17 tools, 2 resources (Markdown guide, workspace overview) and 2 prompts (release notes from changes, translate post). Drafts by default, plus the **Integrations can publish** safety switch.
- **`@featherlog/mcp`**: a stdio bridge for MCP clients that only support local servers.
- **Authentication**: email and password, magic links, optional Google sign-in, and sign-up modes `open`/`invite`/`closed`. Owners and admins can create password reset links for members in **Settings → Team**, and a `reset-password` CLI covers instances where nobody can sign in.
- **Self-hosting**: a single Docker image (web and `worker` commands, amd64 and arm64), a Docker Compose file with optional Caddy for automatic HTTPS, migrations on start, local or S3/R2 storage, any SMTP provider, and a `/healthz` endpoint.
- **Operations**: an idempotent server bootstrap script, a deploy script with health check and rollback by tag, encrypted Postgres backups to S3/R2 (age), a weekly automated restore check, and a GitHub Actions release pipeline (main → staging, tags → production with approval).

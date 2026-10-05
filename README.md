# Featherlog

A lightweight, open-source changelog with a public page, an in-app widget and an API your AI agents can write to. A self-hostable alternative to Headway.

## Features

- **Public changelog page**: one page per workspace with categories, per-post permalinks, a language switcher, RSS and a sitemap.
- **Embeddable widget**: a badge and popup for your product. It accepts **Headway snippets** (`HW_config`, `window.Headway`, `#HW_badge`), so switching usually means changing the script URL and the account id.
- **Native multi-language posts**: one post, one translation per language. The widget picks the visitor's language automatically. You don't need a separate account per language.
- **REST API and MCP server**: an OpenAPI 3.1 REST API, plus a remote MCP server (OAuth 2.1 or API key) so Claude, ChatGPT, Cursor and other agents can draft, translate and publish posts.
- **Scheduling**: publish now or pick a date in the future.
- **Categories**: label a post by writing `[New]` or `[Fix]` in Markdown. Category names are translated per language.
- **Team roles**: owner, admin and editor, with email invitations.
- **RSS** for each language.
- **Privacy options**: private mode, hide from search engines, no cookies in the widget, and privacy-friendly video embeds (YouTube via `youtube-nocookie.com`).
- **Self-hostable**: one Docker image (web and worker) plus Postgres. Caddy is optional and handles HTTPS automatically.

## Self-host with Docker Compose

You need a server with Docker and a domain name. Full guide: [docs/self-hosting.md](docs/self-hosting.md).

```sh
git clone https://github.com/joserobleda/featherlog.git
cd featherlog
cp deploy/.env.example docker/.env
# Edit docker/.env: POSTGRES_PASSWORD, AUTH_SECRET (openssl rand -base64 32), APP_URL, SMTP…
docker compose -f docker/compose.yml --profile caddy up -d
```

Open your `APP_URL` and sign up. The first account can always sign up, whatever `SIGNUP_MODE` says. Leave out `--profile caddy` if you already run a reverse proxy, and point it at `127.0.0.1:3000`.

## Local development

Requirements: Node.js 22+, pnpm 9 (`corepack enable`), Docker.

```sh
pnpm install
pnpm --filter @featherlog/widget build      # builds the widget once (pnpm dev copies it into public/)
pnpm services                               # Postgres :5442, Mailpit :8025 (SMTP :1025), MinIO :9100/:9101
cp apps/web/.env.example apps/web/.env.local
pnpm dev                                    # http://localhost:3100 (migrations run on start)
pnpm db:seed                                # optional: demo "acme" workspace with posts
```

- Mailpit at http://localhost:8025 catches every email: verification, magic links and invitations.
- `pnpm db:seed` prints the demo sign-in and an API key. The credentials are defined in [`apps/web/scripts/seed.ts`](apps/web/scripts/seed.ts) and can be overridden with `SEED_EMAIL`, `SEED_PASSWORD` and `SEED_SLUG`. **They are for development only.**
- The demo changelog lives at http://localhost:3100/acme.

## Embed the widget

Copy the snippet from **Settings → Widget**. It looks like this:

```html
<span class="featherlog-badge"></span>

<script>
  var HW_config = {
    selector: ".featherlog-badge",
    account: "YOUR_ACCOUNT_ID"
  };
</script>
<script async src="https://changelog.example.com/widget.js"></script>
```

You only need one snippet for every language. The widget reads `<html lang>` or the browser language, and you can force one with `language: "es"`. Options, the JS API, SPAs, styling and CSP are covered in [docs/widget.md](docs/widget.md).

## Connect AI agents

Featherlog runs an MCP server at **`<APP_URL>/mcp`**. By default, agents create **drafts**. Publishing from integrations is off until a workspace admin turns on **Settings → API & MCP → Integrations can publish**.

- **Claude (web and desktop)**: Settings → Connectors → Add custom connector, paste `https://changelog.example.com/mcp`, then sign in. You don't need a key.
- **Claude Code**:
  ```sh
  claude mcp add --transport http featherlog https://changelog.example.com/mcp
  ```
  Then run `/mcp` inside Claude Code to sign in.
- **Other clients that use an API key**: send `Authorization: Bearer fl_live_…`. Create keys in **Settings → API & MCP**.
- **Clients that only support local (stdio) servers**:
  ```sh
  npx -y @featherlog/mcp --url https://changelog.example.com --key fl_live_…
  ```

Details, the full tool list and example prompts: [docs/mcp.md](docs/mcp.md). REST API: [docs/api.md](docs/api.md).

## Monorepo layout

```
apps/web/            Next.js app: dashboard, public pages, REST API, MCP endpoint, widget routes, job worker
packages/core/       Domain logic (posts, categories, workspaces, members, API keys, permissions)
packages/db/         Drizzle schema, SQL migrations, test database helpers
packages/markdown/   Markdown → sanitized HTML (categories, video embeds, image sizing, highlighting)
packages/widget/     Embeddable widget: loader (widget.js) and the iframe app
packages/mcp/        @featherlog/mcp, a stdio bridge to the remote MCP endpoint (published to npm)
docker/              Dockerfile entrypoint and Compose files (production and dev services)
deploy/              Server bootstrap, deploy, backup scripts, Caddyfile, .env template
docs/                Documentation and ADRs
```

## Tests

```sh
pnpm test         # unit and integration tests (Vitest). Uses in-memory Postgres (PGlite) by default
TEST_DATABASE_URL=postgres://featherlog:featherlog@localhost:5442/featherlog pnpm vitest run --project core
                  # core tests against a real Postgres (each test DB is created and dropped)
pnpm e2e          # Playwright end-to-end tests. Starts `pnpm dev` unless a server is already on :3100
pnpm lint         # Biome
pnpm typecheck
```

Before the first e2e run, install Chromium with `pnpm exec playwright install chromium`. E2E tests need `pnpm services` to be running.

## Documentation

- [Self-hosting](docs/self-hosting.md) and the [configuration reference](docs/configuration.md)
- [Reference deployment on Hetzner](docs/deploy-hetzner.md)
- [Widget](docs/widget.md)
- [Markdown syntax](docs/markdown.md)
- [REST API](docs/api.md)
- [MCP server](docs/mcp.md)
- [Migrating from Headway](docs/migrating-from-headway.md)
- [Architecture](docs/architecture.md) and [ADRs](docs/adr/)
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Changelog](CHANGELOG.md)

## Migrating from Headway

1. Create a workspace and copy your new account id from **Settings → Widget**.
2. Change the script URL in your existing snippet to `<WIDGET_URL>/widget.js` and set `account` to the new id. `HW_config`, `window.Headway`, callbacks and `#HW_badge` styles keep working.
3. If you ran one Headway account per language, merge them into one workspace with several languages.
4. For now, old posts have to be copied over by hand. An importer is on the roadmap.

The full guide is in [docs/migrating-from-headway.md](docs/migrating-from-headway.md).

## License

[AGPL-3.0-only](LICENSE). You can self-host, modify and redistribute Featherlog. If you offer a modified version as a network service, you must publish your changes under the same license. A hosted edition may come later. The self-hosted version stays complete, with every feature enabled.

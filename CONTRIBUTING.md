# Contributing to Featherlog

Thanks for helping. Bug reports, docs fixes, translations and code are all welcome.

## Before you start

- **Bugs:** open an issue with steps to reproduce. Check existing issues first.
- **Features:** open an issue or discussion before writing a large change, so we can agree on the approach.
- **Security issues:** don't open a public issue. See [SECURITY.md](SECURITY.md).

By contributing, you agree that your contributions are licensed under [AGPL-3.0-only](LICENSE).

## Setup

Requirements: Node.js 22+ (see `.nvmrc`), pnpm 9 (`corepack enable`), Docker.

```sh
pnpm install
pnpm --filter @featherlog/widget build
pnpm services                                # Postgres :5442, Mailpit :8025, MinIO :9100
cp apps/web/.env.example apps/web/.env.local
pnpm dev                                     # http://localhost:3100
pnpm db:seed                                 # demo workspace "acme" (dev only)
```

Emails sent in development show up in Mailpit at http://localhost:8025.

Useful scripts:

| Command | What it does |
| --- | --- |
| `pnpm dev` | Next.js dev server on :3100 (applies migrations on start with `MIGRATE_ON_START=true`). |
| `pnpm --filter @featherlog/widget build` | Rebuild the widget after changing `packages/widget`. `pnpm dev` copies the build into `apps/web/public`. |
| `pnpm test` / `pnpm test:watch` | Vitest, all projects. |
| `pnpm e2e` | Playwright (needs `pnpm services`, and Chromium from `pnpm exec playwright install chromium`). |
| `pnpm lint` / `pnpm format` | Biome check / Biome check with fixes. |
| `pnpm typecheck` | TypeScript in every package. |
| `pnpm db:generate` | Generate a migration after editing `packages/db/src/schema.ts`. |
| `pnpm db:migrate` | Apply migrations (reads `DATABASE_URL` from the environment or `apps/web/.env.local`). |

## Where code goes

- **Business rules go in `packages/core`, not in `apps/web`.** Permissions, validation, publishing policy, versioning and anything else that has to behave the same in the dashboard, REST API and MCP server belongs there. Core functions take a `Ctx` and check permissions themselves. See [ADR 0003](docs/adr/0003-api-mcp-single-core.md).
- `apps/web` holds adapters: server actions, route handlers, the Hono API (`src/server/api`), MCP tools (`src/server/mcp`) and UI. Keep them thin.
- Schema changes go in `packages/db/src/schema.ts`, followed by `pnpm db:generate`. Commit the generated SQL. Migrations must be **additive and backwards compatible** (add columns as nullable or with defaults, and don't drop or rename in the same release), because rollbacks redeploy the previous image on the newer schema.
- Markdown features go in `packages/markdown`, and need XSS tests for anything that produces HTML.
- Widget changes in `packages/widget` must keep Headway compatibility (`HW_config`, `window.Headway`, `#HW_badge`).
- A new REST endpoint usually needs a matching MCP tool, and vice versa. Update `docs/api.md` and `docs/mcp.md`.
- UI strings go through next-intl (`apps/web/messages/en` and `es`). Add both languages.

## Conventions

- **TypeScript strict** (`noUncheckedIndexedAccess` included). Avoid `any`, and validate external input with zod.
- **Biome** formats and lints: 2 spaces, double quotes, semicolons, 100 columns. Run `pnpm format` before committing. CI runs `pnpm lint`.
- **Tests are required** for behavior changes:
  - core logic → `packages/*/test` (Vitest; `createTestDb()` gives you a migrated database)
  - API and MCP behavior and user flows → `apps/web/e2e` (Playwright) when unit tests aren't enough
  - bug fixes → a test that fails without the fix
- Keep dependencies few. Discuss new runtime dependencies in the PR.
- Update the docs in `docs/` when you change behavior, configuration or the API. Add a line to `CHANGELOG.md` under *Unreleased*.

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat: …`, `fix: …`, `docs: …`, `refactor: …`, `test: …`, `chore: …`. Add a scope when it helps: `feat(widget): …`.
- Keep PRs focused, one change per PR. Rebase on `main`.
- CI must pass: lint, typecheck, unit tests, e2e and the Docker build.
- Fill in the PR template, including how you tested the change.

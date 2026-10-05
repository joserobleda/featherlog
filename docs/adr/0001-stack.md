# ADR 0001: Technology stack

- **Status:** Accepted
- **Date:** 2026-10

## Context

Featherlog has to be easy to self-host (one container plus Postgres), cheap to run on a small VPS, and pleasant for one maintainer or a small team to develop. It serves very different audiences: a dashboard for writers, fast public pages for readers, a tiny embeddable script for host sites, and machine interfaces (REST and MCP) for integrations and agents.

## Decision

- **TypeScript everywhere**, in strict mode, as a **pnpm monorepo**: `apps/web` plus internal packages (`core`, `db`, `markdown`, `widget`, `mcp`).
- **Next.js (App Router)** as the single server: React Server Components and server actions for the dashboard, server-rendered public pages, and route handlers for the REST API, MCP, widget and uploads. It is built as `output: "standalone"`.
- **PostgreSQL** as the only stateful dependency, accessed through **Drizzle ORM**, with SQL migrations committed in `packages/db/drizzle`.
- **pg-boss** for background jobs on the same Postgres. There is no Redis.
- **Better Auth** for sessions, email and password, magic links, Google sign-in and the OAuth 2.1 authorization server that MCP clients use.
- **Hono + zod-openapi** for the REST API, so validation and the OpenAPI document come from the same schemas.
- **Official MCP TypeScript SDK** for the MCP server and the stdio bridge.
- **unified/remark/rehype** for Markdown rendering and sanitization.
- **esbuild** for the widget bundles, which have no framework.
- **Biome** for linting and formatting, **Vitest** for unit and integration tests (in-memory PGlite by default, real Postgres in CI), **Playwright** for end-to-end tests.
- **One Docker image** (Node 22 Alpine) that runs `web` or `worker`, published to GHCR for amd64 and arm64.

## Consequences

- Self-hosters run two containers, app and Postgres, with optional Caddy. Backups are a `pg_dump`.
- One language and one process model keep the contributor surface small. Domain logic lives in `packages/core`, so the framework is just an adapter layer.
- Next.js is a large dependency with a fast release cycle. Upgrades need care, and some routes (`/_widget`, `/api/widget`) bypass React entirely to stay small and cacheable.
- Postgres-only infrastructure limits throughput compared with a dedicated queue or cache, which is far beyond what a changelog needs. The in-memory API rate limiter would have to move to a shared store if we ever run several instances.
- PGlite makes the test suite fast and dependency-free. CI also runs the core tests against real Postgres to catch driver differences.

# ADR 0003: REST API and MCP server share a single domain core

- **Status:** Accepted
- **Date:** 2026-10

## Context

Featherlog has three ways to change data: the dashboard, a REST API for scripts and CI, and an MCP server for AI agents. If each entry point implemented its own rules, permissions, validation, "integrations can't publish" checks, optimistic concurrency and Markdown rendering would drift apart. Agents in particular need the *same* guarantees as people, ideally stronger ones.

## Decision

- All business logic lives in **`packages/core`**, as plain async functions that take a `Ctx`: `{ db, workspaceId, actor, via }`.
  - `actor` is a user (with role, and optional OAuth scopes) or an API key (with scopes). `permissionsOf(actor)` resolves what it may do: role permissions for people, scopes for keys, and *role ∩ scopes* for OAuth or MCP sessions.
  - `via` is `panel`, `api` or `mcp`. Core uses it for policy, for example `integrationsCanPublish` blocks publishing when `via !== "panel"`, and records it on posts (`createdVia`, `actorLabel`).
  - Every function checks its own permissions (`assertCan`) and versions (`expectedVersion`), and throws a typed `AppError`.
- **Entry points are thin adapters.** They authenticate, build a `Ctx`, validate input shape, call core and map results and errors to their protocol: server actions → UI state, Hono → JSON and `problem+json` with ETags and idempotency, MCP → tool results with `isError`.
- The **stdio MCP package** (`@featherlog/mcp`) is only a transport bridge to the remote `/mcp` endpoint. Tools are defined in one place, on the server.

## Consequences

- A rule added to core applies to the dashboard, REST and MCP at once, and it is tested once (`packages/core/test`).
- REST and MCP expose the same operations with the same semantics. The docs can describe one permission model.
- Safety defaults are enforced centrally: drafts by default, the opt-in publishing switch, and versions to protect human edits. An adapter can't forget them.
- Adapters still own protocol details: rate limits, idempotency keys and OpenAPI for REST, workspace resolution and tool descriptions for MCP. Small differences can creep in there, so new tools and endpoints should be reviewed side by side.
- Core must stay framework-free (no Next.js imports), which keeps it usable from scripts (`apps/web/scripts`), the worker and tests.

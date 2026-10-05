## What does this change?

<!-- A short description of the change and why it's needed. Link the issue: "Closes #123". -->

## How was it tested?

<!-- Unit tests, e2e tests, manual steps (dashboard, API, MCP, widget on a host page…). -->

## Checklist

- [ ] Business logic lives in `packages/core`, and adapters (`apps/web`) stay thin
- [ ] Tests added or updated (`pnpm test`, and `pnpm e2e` where relevant)
- [ ] `pnpm lint` and `pnpm typecheck` pass
- [ ] Database migrations (if any) are additive and backwards compatible
- [ ] REST API and MCP stay in sync (if either changed)
- [ ] Docs updated (`docs/`, README) and a line added to `CHANGELOG.md`
- [ ] UI strings added in every dashboard language (`apps/web/messages/en`, `es`)

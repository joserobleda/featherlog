# syntax=docker/dockerfile:1.7
# Featherlog — single image: web server (default) and background worker (`worker` command).

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat && corepack enable
WORKDIR /repo

# --- install dependencies (cached while manifests don't change) -------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/markdown/package.json packages/markdown/
COPY packages/widget/package.json packages/widget/
COPY packages/mcp/package.json packages/mcp/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

# --- build -------------------------------------------------------------------
FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production
RUN pnpm --filter @featherlog/widget build \
 && pnpm --filter @featherlog/web build \
 && pnpm --filter @featherlog/web build:worker

# --- runtime -----------------------------------------------------------------
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat tini wget
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MIGRATIONS_DIR=/app/migrations \
    UPLOADS_DIR=/data/uploads \
    MIGRATE_ON_START=true

COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
COPY --from=build --chown=node:node /repo/apps/web/dist/worker.mjs ./apps/web/worker.mjs
COPY --from=build --chown=node:node /repo/apps/web/dist/create-api-key.mjs ./apps/web/create-api-key.mjs
COPY --from=build --chown=node:node /repo/apps/web/dist/import-headway.mjs ./apps/web/import-headway.mjs
COPY --from=build --chown=node:node /repo/packages/db/drizzle ./migrations
COPY --chown=node:node docker/entrypoint.sh /usr/local/bin/featherlog
# The bundled CLIs (import-headway) load sharp at runtime; the standalone output keeps it only
# inside the pnpm store, so expose it where Node resolves packages from /app/apps/web.
RUN ln -s "$(ls -d node_modules/.pnpm/sharp@*/node_modules/sharp | head -1 | sed 's#^node_modules/##')" node_modules/sharp \
  && chmod +x /usr/local/bin/featherlog && mkdir -p /data/uploads && chown -R node:node /data

USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--", "featherlog"]
CMD ["web"]

#!/bin/sh
set -e
case "${1:-web}" in
  web)
    exec node /app/apps/web/server.js
    ;;
  worker)
    exec node /app/apps/web/worker.mjs
    ;;
  import-headway)
    # docker compose exec app featherlog import-headway --workspace <slug> --source <account>:<locale> … [--dry-run]
    shift
    exec node /app/apps/web/import-headway.mjs "$@"
    ;;
  create-api-key)
    # docker compose exec app featherlog create-api-key <workspace-slug> [name] [scopes]
    shift
    exec node /app/apps/web/create-api-key.mjs "$@"
    ;;
  *)
    exec "$@"
    ;;
esac

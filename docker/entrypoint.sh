#!/bin/sh
set -e
case "${1:-web}" in
  web)
    exec node /app/apps/web/server.js
    ;;
  worker)
    exec node /app/apps/web/worker.mjs
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

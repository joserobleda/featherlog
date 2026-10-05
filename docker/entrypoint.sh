#!/bin/sh
set -e
case "${1:-web}" in
  web)
    exec node /app/apps/web/server.js
    ;;
  worker)
    exec node /app/apps/web/worker.mjs
    ;;
  *)
    exec "$@"
    ;;
esac

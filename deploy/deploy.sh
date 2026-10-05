#!/usr/bin/env bash
# Deploys a Featherlog image on this server. Used by CI over SSH and by hand:
#   /opt/featherlog/deploy.sh ghcr.io/joserobleda/featherlog:1.2.3 [environment]
# Rollback = run it again with the previous tag (migrations are additive).
set -euo pipefail
IMAGE=${1:?usage: deploy.sh <image:tag> [environment]}
ENVIRONMENT=${2:-production}
APP_DIR=$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)
cd "$APP_DIR/docker"

PROFILE_ARGS=()
if [ "${USE_CADDY:-$(grep -E '^USE_CADDY=' .env 2>/dev/null | cut -d= -f2)}" = "1" ]; then PROFILE_ARGS=(--profile caddy); fi

echo "[$(date -u +%FT%TZ)] deploying $IMAGE ($ENVIRONMENT)"
echo "$IMAGE" >> "$APP_DIR/deploy/history.log"
export FEATHERLOG_IMAGE="$IMAGE"
docker compose "${PROFILE_ARGS[@]}" pull app
docker compose "${PROFILE_ARGS[@]}" up -d --remove-orphans

for i in $(seq 1 40); do
  if docker compose exec -T app wget -qO- http://127.0.0.1:3000/healthz >/dev/null 2>&1; then
    echo "healthy"; docker image prune -f >/dev/null; exit 0
  fi
  sleep 3
done
echo "app did not become healthy — recent logs:" >&2
docker compose logs --tail 80 app >&2
exit 1

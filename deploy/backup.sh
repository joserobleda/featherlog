#!/usr/bin/env bash
# Daily Postgres backup. Works with zero external services:
#   - always keeps compressed dumps on the server in $APP_DIR/backups (last BACKUP_KEEP_DAYS days, default 14)
#     → pair it with your provider's server backups/snapshots (e.g. DigitalOcean Droplet backups)
#   - optionally encrypts them (BACKUP_AGE_RECIPIENT) and uploads to S3-compatible storage (BACKUP_S3_BUCKET)
# Settings are read from /opt/featherlog/docker/.env. Restore:
#   gunzip -c dump.sql.gz | docker compose exec -T postgres psql -U featherlog featherlog
#   (encrypted: age -d -i key.txt dump.sql.gz.age | gunzip | …)
set -euo pipefail
APP_DIR=$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)
ENV_FILE="$APP_DIR/docker/.env"
get() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2- | sed 's/^"//;s/"$//' || true; }

KEEP=$(get BACKUP_KEEP_DAYS); KEEP=${KEEP:-14}
RECIPIENT=$(get BACKUP_AGE_RECIPIENT)
BUCKET=$(get BACKUP_S3_BUCKET)
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$APP_DIR/backups"
cd "$APP_DIR/docker"

FILE="featherlog-$STAMP.sql.gz"
if [ -n "$RECIPIENT" ]; then
  FILE="$FILE.age"
  docker compose exec -T postgres pg_dump -U featherlog --no-owner --clean --if-exists featherlog | gzip -9 | age -r "$RECIPIENT" > "$APP_DIR/backups/$FILE"
else
  docker compose exec -T postgres pg_dump -U featherlog --no-owner --clean --if-exists featherlog | gzip -9 > "$APP_DIR/backups/$FILE"
fi
chmod 600 "$APP_DIR/backups/$FILE"
echo "[$STAMP] local backup: $APP_DIR/backups/$FILE"

if [ -n "$BUCKET" ]; then
  docker run --rm -v "$APP_DIR/backups:/backups:ro" \
    -e AWS_ACCESS_KEY_ID="$(get BACKUP_S3_ACCESS_KEY_ID)" -e AWS_SECRET_ACCESS_KEY="$(get BACKUP_S3_SECRET_ACCESS_KEY)" \
    -e AWS_DEFAULT_REGION=auto amazon/aws-cli:latest \
    s3 cp "/backups/$FILE" "s3://$BUCKET/postgres/$FILE" --endpoint-url "$(get BACKUP_S3_ENDPOINT)" --only-show-errors
  echo "[$STAMP] uploaded to s3://$BUCKET/postgres/$FILE"
fi

find "$APP_DIR/backups" -name 'featherlog-*.sql.gz*' -mtime +"$KEEP" -delete

#!/usr/bin/env bash
# Daily encrypted Postgres backup to S3-compatible storage (Cloudflare R2, S3, B2…).
# Configure in /opt/featherlog/docker/.env:
#   BACKUP_S3_BUCKET=featherlog-backups
#   BACKUP_S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
#   BACKUP_S3_ACCESS_KEY_ID=…  BACKUP_S3_SECRET_ACCESS_KEY=…
#   BACKUP_AGE_RECIPIENT=age1…   (public key; keep the private key OFF the server)
#   BACKUP_RETENTION_DAYS=30
# Restore: age -d -i key.txt dump.sql.gz.age | gunzip | psql "$DATABASE_URL"
set -euo pipefail
APP_DIR=$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)
ENV_FILE="$APP_DIR/docker/.env"
get() { grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- | sed 's/^"//;s/"$//'; }

BUCKET=$(get BACKUP_S3_BUCKET || true)
if [ -z "${BUCKET:-}" ]; then echo "backups not configured (BACKUP_S3_BUCKET empty) — skipping"; exit 0; fi
ENDPOINT=$(get BACKUP_S3_ENDPOINT)
RECIPIENT=$(get BACKUP_AGE_RECIPIENT)
RETENTION=$(get BACKUP_RETENTION_DAYS || echo 30)
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILE="featherlog-$STAMP.sql.gz.age"
mkdir -p "$APP_DIR/backups"
cd "$APP_DIR/docker"

docker compose exec -T postgres pg_dump -U featherlog --no-owner --clean --if-exists featherlog \
  | gzip -9 \
  | age -r "$RECIPIENT" > "$APP_DIR/backups/$FILE"

docker run --rm -v "$APP_DIR/backups:/backups:ro" \
  -e AWS_ACCESS_KEY_ID="$(get BACKUP_S3_ACCESS_KEY_ID)" -e AWS_SECRET_ACCESS_KEY="$(get BACKUP_S3_SECRET_ACCESS_KEY)" \
  -e AWS_DEFAULT_REGION=auto amazon/aws-cli:latest \
  s3 cp "/backups/$FILE" "s3://$BUCKET/postgres/$FILE" --endpoint-url "$ENDPOINT" --only-show-errors

# Local copies: keep 3 days. Remote retention: use a bucket lifecycle rule of $RETENTION days.
find "$APP_DIR/backups" -name 'featherlog-*.sql.gz.age' -mtime +3 -delete
echo "[$STAMP] backup uploaded: s3://$BUCKET/postgres/$FILE (retention: ${RETENTION}d via lifecycle rule)"

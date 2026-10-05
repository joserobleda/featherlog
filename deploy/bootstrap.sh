#!/usr/bin/env bash
# Idempotent provisioning for a fresh (or existing) Ubuntu/Debian server, e.g. Hetzner Cloud.
# Run as root:  curl -fsSL https://raw.githubusercontent.com/joserobleda/featherlog/main/deploy/bootstrap.sh | bash
# Or:          scp deploy/bootstrap.sh root@server: && ssh root@server 'bash bootstrap.sh'
#
# What it does (safe to re-run):
#  - installs Docker Engine + compose plugin (if missing)
#  - creates a `deploy` user allowed to run docker (for CI deployments over SSH)
#  - opens 22/80/443 in ufw if ufw is active (does NOT enable or reset an existing firewall)
#  - creates /opt/featherlog with compose file, Caddyfile, deploy and backup scripts, .env template
#  - installs a daily backup cron job (only does something once backups are configured in .env)
set -euo pipefail

APP_DIR=/opt/featherlog
DEPLOY_USER=${DEPLOY_USER:-deploy}
REPO_RAW=${REPO_RAW:-https://raw.githubusercontent.com/joserobleda/featherlog/main}

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then echo "Run as root" >&2; exit 1; fi

if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker"
  curl -fsSL https://get.docker.com | sh
else
  log "Docker already installed: $(docker --version)"
fi
systemctl enable --now docker >/dev/null 2>&1 || true

if ! command -v age >/dev/null 2>&1; then
  log "Installing age (backup encryption)"
  apt-get update -qq && apt-get install -y -qq age >/dev/null
fi

if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  log "Creating user $DEPLOY_USER"
  useradd --create-home --shell /bin/bash "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
touch "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  log "Allowing 22, 80, 443 in ufw"
  ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 443/udp >/dev/null
fi

log "Preparing $APP_DIR"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR" "$APP_DIR/deploy" "$APP_DIR/docker" "$APP_DIR/backups"
fetch() { curl -fsSL "$REPO_RAW/$1" -o "$APP_DIR/$1"; chown "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR/$1"; }
fetch docker/compose.yml
fetch deploy/Caddyfile
fetch deploy/deploy.sh
fetch deploy/backup.sh
chmod +x "$APP_DIR/deploy/deploy.sh" "$APP_DIR/deploy/backup.sh"
ln -sf "$APP_DIR/deploy/deploy.sh" "$APP_DIR/deploy.sh"

if [ ! -f "$APP_DIR/docker/.env" ]; then
  fetch deploy/.env.example
  mv "$APP_DIR/deploy/.env.example" "$APP_DIR/docker/.env"
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" "$APP_DIR/docker/.env"
  sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=$(openssl rand -base64 36 | tr -d '\n')|" "$APP_DIR/docker/.env"
  chmod 600 "$APP_DIR/docker/.env"; chown "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR/docker/.env"
  log "Created $APP_DIR/docker/.env with generated secrets — edit APP_URL, APP_DOMAIN, SMTP and storage."
fi

CRON_LINE="23 3 * * * $DEPLOY_USER $APP_DIR/deploy/backup.sh >> /var/log/featherlog-backup.log 2>&1"
echo "$CRON_LINE" > /etc/cron.d/featherlog-backup

cat <<MSG

Done. Next steps:
  1. Edit $APP_DIR/docker/.env (APP_URL, APP_DOMAIN, SMTP_URL, MAIL_FROM, storage, backups).
  2. Add the CI deploy public key to /home/$DEPLOY_USER/.ssh/authorized_keys.
  3. Start it:  sudo -u $DEPLOY_USER $APP_DIR/deploy.sh ghcr.io/joserobleda/featherlog:latest
     (add USE_CADDY=1 to let Featherlog's Caddy own ports 80/443; otherwise point your
      existing reverse proxy at 127.0.0.1:3000)
MSG

# Reference deployment: one DigitalOcean Droplet

The lightest way to run Featherlog in production: **one server** running the app, Postgres and
Caddy (automatic HTTPS) with Docker Compose. No managed database, no object storage, no CDN, no
email provider required.

| Need | Minimal choice | Optional upgrade |
|---|---|---|
| Compute + database | 1 Droplet (2 GB RAM is plenty) with the bundled Postgres | Managed Postgres |
| HTTPS | Bundled Caddy (Let's Encrypt) | Cloudflare in front |
| Files (images) | Local Docker volume | DigitalOcean Spaces (`STORAGE_DRIVER=s3`) |
| Backups | Daily `pg_dump` on the server + **Droplet backups** | Encrypted off-site copy to Spaces |
| Email | None — invitations are shared as links | Any SMTP provider |
| Sign-in | Email + password | Google sign-in limited to your domain |
| Images registry | GitHub Container Registry (public, free) | — |

## 1. Create the Droplet

- Ubuntu 24.04, 2 GB / 1 vCPU (Basic), region close to your users.
- Enable **Backups** (daily or weekly) — this covers the database dumps *and* the uploads volume.
- Add your SSH key.
- Point a DNS `A` record (e.g. `changelog.example.com`) at the Droplet IP.

## 2. Bootstrap

```sh
ssh root@<droplet-ip>
curl -fsSL https://raw.githubusercontent.com/joserobleda/featherlog/main/deploy/bootstrap.sh | bash
```

[`deploy/bootstrap.sh`](../deploy/bootstrap.sh) is idempotent: it installs Docker, creates a `deploy`
user, opens 22/80/443 if `ufw` is active, lays out `/opt/featherlog` (compose file, Caddyfile,
deploy and backup scripts) with generated secrets in `/opt/featherlog/docker/.env`, and installs a
daily backup cron job.

## 3. Configure

Edit `/opt/featherlog/docker/.env` (template: [`deploy/.env.example`](../deploy/.env.example)).
The minimum:

```sh
APP_URL=https://changelog.example.com
APP_DOMAIN=changelog.example.com
ACME_EMAIL=you@example.com
USE_CADDY=1
SIGNUP_MODE=invite
```

For a company instance, let colleagues join on their own and land in the right workspace. The domain rule needs proven addresses, so pair it with Google sign-in (no email provider needed) or SMTP verification:

```sh
ALLOWED_EMAIL_DOMAINS=example.com
AUTO_JOIN_WORKSPACE=example        # workspace slug
# Google Workspace sign-in (OAuth client redirect URI: https://<APP_DOMAIN>/api/auth/callback/google)
GOOGLE_CLIENT_ID=…
GOOGLE_CLIENT_SECRET=…
```

## 4. Start

```sh
sudo -u deploy /opt/featherlog/deploy.sh ghcr.io/joserobleda/featherlog:latest
```

Open `APP_URL`, create the first account (it can always sign up) and your workspace. Migrations run
automatically on start; `/healthz` reports health.

## 5. Automatic deployments (optional)

[`.github/workflows/release.yml`](../.github/workflows/release.yml) builds the image on every push to
`main` and on `v*` tags, and deploys over SSH when these are configured in the repository
(Settings → Secrets and variables → Actions):

| Kind | Name | Value |
|---|---|---|
| Secret | `DEPLOY_SSH_KEY` | Private key whose public half is in `/home/deploy/.ssh/authorized_keys` |
| Variable | `PRODUCTION_HOST` | Droplet IP or hostname |
| Variable | `PRODUCTION_URL` | `https://changelog.example.com` (smoke test) |
| Variable | `STAGING_HOST`, `STAGING_URL` | Only if you run a staging server (deployed from `main`) |
| Variable | `DEPLOY_USER` | Defaults to `deploy` |

Create a `production` environment with required reviewers to approve each release. Release flow:
merge to `main` → (staging) → tag `vX.Y.Z` → approve → production. Roll back by running
`deploy.sh` with the previous tag (listed in `/opt/featherlog/deploy/history.log`); migrations are
additive.

## 6. Backups and restore

`deploy/backup.sh` runs daily (03:23 UTC) and keeps `BACKUP_KEEP_DAYS` (default 14) compressed dumps
in `/opt/featherlog/backups`; Droplet backups capture them along with the uploads volume. For an
off-site copy, set `BACKUP_AGE_RECIPIENT` and `BACKUP_S3_*` (e.g. a Spaces bucket) — see
[self-hosting](self-hosting.md#backups).

Restore a dump:

```sh
cd /opt/featherlog/docker
gunzip -c ../backups/featherlog-<stamp>.sql.gz | docker compose exec -T postgres psql -U featherlog featherlog
```

## 7. Upgrades

Deploy a newer tag with `deploy.sh` (or let CI do it). Keep an eye on the [changelog](../CHANGELOG.md).

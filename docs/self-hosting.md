# Self-hosting Featherlog

Featherlog ships as **one Docker image** (`ghcr.io/joserobleda/featherlog`). The same image runs the web server and, optionally, a background worker. You also need Postgres. [`docker/compose.yml`](../docker/compose.yml) brings everything up, with an optional Caddy for automatic HTTPS.

For our minimal production setup (one DigitalOcean Droplet, no other services), see [deploy-digitalocean.md](deploy-digitalocean.md).

## Requirements

- A Linux server with Docker Engine and the Compose plugin. 1 vCPU and 1 GB of RAM is enough for most changelogs. Images are published for `linux/amd64` and `linux/arm64`.
- A domain or subdomain pointing at the server, for example `changelog.example.com`.
- Optional: an SMTP provider (Resend, Postmark, SES, Mailgun…) for verification, magic links, password resets and invitation emails. Without one, invitations are shared as links from the dashboard.
- Optional: an S3-compatible bucket for uploaded images.

## Quick setup with Docker Compose

```sh
git clone https://github.com/joserobleda/featherlog.git
cd featherlog
cp deploy/.env.example docker/.env
```

Edit `docker/.env`. At least set these:

```sh
POSTGRES_PASSWORD=…              # openssl rand -hex 24
AUTH_SECRET=…                    # openssl rand -base64 32
APP_URL=https://changelog.example.com
APP_DOMAIN=changelog.example.com # only used by the bundled Caddy
ACME_EMAIL=you@example.com
SMTP_URL=smtps://user:password@smtp.example.com:465
MAIL_FROM="Featherlog <changelog@example.com>"
```

Then start it, with or without the bundled Caddy (both options are explained below):

```sh
# Caddy handles ports 80/443 and gets certificates automatically
docker compose -f docker/compose.yml --profile caddy up -d

# …or, without Caddy (you already have a reverse proxy)
docker compose -f docker/compose.yml up -d
```

Open `APP_URL`, sign up and create your first workspace. The first account can always sign up. After that, `SIGNUP_MODE` applies.

> You don't need to clone the whole repository. The server only needs `docker/compose.yml`, `deploy/Caddyfile` (when you use Caddy) and `docker/.env`, laid out the same way. [`deploy/bootstrap.sh`](../deploy/bootstrap.sh) creates exactly that under `/opt/featherlog`.

Every variable is described in the [configuration reference](configuration.md).

## With the bundled Caddy

`--profile caddy` starts Caddy, which listens on ports 80 and 443 (plus 443/udp for HTTP/3). It gets a Let's Encrypt certificate for `APP_DOMAIN` and proxies to the app. The config lives in [`deploy/Caddyfile`](../deploy/Caddyfile).

- DNS for `APP_DOMAIN` must point at the server before you start, or the certificate request fails.
- Ports 80 and 443 must be free and open in your firewall.

## Behind an existing reverse proxy

Without the Caddy profile, the app is published on **`127.0.0.1:3000`** only. It can't be reached from outside the server. Point your proxy at it. Change the address with `APP_BIND`/`APP_PORT` in `docker/.env`.

nginx:

```nginx
server {
  server_name changelog.example.com;
  # listen 443 ssl; ssl_certificate …;

  client_max_body_size 12m;   # image uploads are limited to 10 MB

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

Your existing Caddy:

```caddy
changelog.example.com {
	reverse_proxy 127.0.0.1:3000
}
```

Forward the original `Host` (or `X-Forwarded-Host`). Featherlog routes requests by host when you use [separate hosts](#separate-hosts-for-public-pages-and-widget).

## Separate hosts for public pages and widget

By default everything is served from `APP_URL`: dashboard, public pages, widget, API and MCP. You can split it into up to three hosts:

```sh
APP_URL=https://app.example.com         # dashboard, auth, REST API, MCP
PUBLIC_URL=https://updates.example.com  # public changelog pages, RSS, sitemaps
WIDGET_URL=https://widget.example.com   # widget.js, the widget iframe and the widget JSON
```

All hosts must reach the same app container. With the bundled Caddy, add a site block per host to `deploy/Caddyfile`:

```caddy
updates.example.com, widget.example.com {
	encode zstd gzip
	reverse_proxy app:3000 {
		header_up X-Forwarded-Proto {scheme}
	}
}
```

How hosts are routed:

- On the **widget host**, only widget paths, `/uploads/…` and `/healthz` are served. Everything else returns 404.
- On the **public host**, `/` and app paths (`/app`, `/login`, `/api`, `/mcp`…) redirect to `APP_URL`.
- A changelog lives at `<PUBLIC_URL>/<slug>`. Other languages are at `<PUBLIC_URL>/<slug>/<locale>`.

Changing `WIDGET_URL` changes the script URL in your snippet, so update your embeds.

## File storage (S3 / R2)

Uploads (post images, logos, avatars) are stored on the local `uploads` volume by default. To use a bucket instead:

```sh
STORAGE_DRIVER=s3
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com   # empty for AWS S3
S3_REGION=auto
S3_BUCKET=featherlog
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
S3_PUBLIC_URL=https://files.example.com                      # optional
```

- With `S3_PUBLIC_URL`, image URLs point straight at the bucket's public domain (for R2, a custom domain on the bucket). Without it, files are proxied through `<APP_URL>/uploads/…`.
- Objects are uploaded with `Cache-Control: public, max-age=31536000, immutable`. Keys never change.
- The app needs read and write access to the bucket.
- Switching drivers doesn't migrate existing files. Image URLs already used in posts keep pointing where they were. Copy `/data/uploads` into the bucket under the same keys if you switch later and still serve `/uploads/…` from the app.

## Email (SMTP)

Email is optional. Without `SMTP_URL`, Featherlog skips emails: invitations show a link to share by hand, email verification is off (restrict sign-ups with `SIGNUP_MODE` / `ALLOWED_EMAIL_DOMAINS`), and magic-link sign-in and password-reset emails are hidden. To enable it, set `SMTP_URL` and `MAIL_FROM`. Any SMTP provider works:

```sh
SMTP_URL=smtps://resend:re_xxx@smtp.resend.com:465
MAIL_FROM="Acme Changelog <changelog@acme.com>"
```

Use a sender domain with SPF and DKIM set up. In production, new accounts must verify their email before they can sign in. Sending failures are logged and don't break the request. Check `docker compose logs app` if emails don't arrive.

## Sign-up modes

`SIGNUP_MODE` controls who can create an account after the first user:

| Mode | Who can sign up |
| --- | --- |
| `open` | Anyone. |
| `invite` (recommended for most teams) | Only email addresses with an invitation to a workspace (**Settings → Team**). |
| `closed` | Nobody. Existing users keep working. |

The first account on a fresh instance can always sign up.

## Google sign-in

1. In Google Cloud Console, create an **OAuth client ID** of type *Web application*.
2. Add the authorized redirect URI `<APP_URL>/api/auth/callback/google`.
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` and restart.

If a Google account has the same email as an existing account, the two are linked. Sign-up modes apply to Google sign-ups too.

## Background jobs (worker modes)

Background jobs run on [pg-boss](https://github.com/timgit/pg-boss) and use the same Postgres database (schema `pgboss`). Today the only job is a daily cleanup of expired idempotency keys. Scheduled posts don't need a worker: a post's status is computed from its publication date when it is read.

- `WORKER_MODE=inline` (default): jobs run inside the web process. Use this unless you have a reason not to.
- `WORKER_MODE=separate`: the web process doesn't run jobs. Start a second container from the same image with the `worker` command. Add this to `docker/compose.yml`, or put it in a `compose.override.yml` next to it:

  ```yaml
  services:
    worker:
      image: ${FEATHERLOG_IMAGE:-ghcr.io/joserobleda/featherlog:latest}
      command: ["worker"]
      restart: unless-stopped
      env_file: .env
      environment:
        DATABASE_URL: postgres://featherlog:${POSTGRES_PASSWORD}@postgres:5432/featherlog
      depends_on:
        postgres:
          condition: service_healthy
  ```

- `WORKER_MODE=off`: no jobs run.

## Database migrations

The image runs with `MIGRATE_ON_START=true`: pending migrations are applied when the server starts, under a Postgres advisory lock. Several instances starting at once can't both run them. If you set `MIGRATE_ON_START=false`, apply them yourself from a checkout of the same version:

```sh
DATABASE_URL=postgres://… pnpm db:migrate
```

## Upgrades and rollbacks

Images are tagged `X.Y.Z`, `X.Y`, `latest` (the newest release) and `edge` (the latest `main`). For production, pin a version:

```sh
# docker/.env
FEATHERLOG_IMAGE=ghcr.io/joserobleda/featherlog:0.1.0
```

To upgrade, back up first, then pull and restart:

```sh
deploy/backup.sh                    # if backups are configured, see below
docker compose -f docker/compose.yml pull app
docker compose -f docker/compose.yml up -d
```

Or use the deploy script. It pulls, restarts, waits for `/healthz` and prints the logs if the app doesn't come up healthy:

```sh
deploy/deploy.sh ghcr.io/joserobleda/featherlog:0.2.0
```

**Rollback**: deploy the previous tag again (`deploy/deploy.sh ghcr.io/joserobleda/featherlog:0.1.0`). Every deployed tag is appended to `deploy/history.log`. Migrations are written to be additive, so an older version normally runs fine on a newer schema. If release notes say a migration isn't backwards compatible, restore the backup you took before upgrading.

## Backups

[`deploy/backup.sh`](../deploy/backup.sh) runs daily (cron installed by `bootstrap.sh`) and needs no external service:

- It dumps Postgres (`pg_dump --clean --if-exists`), compresses it and keeps the last `BACKUP_KEEP_DAYS` (default 14) in `/opt/featherlog/backups`.
- Pair it with your provider's server backups or snapshots (e.g. DigitalOcean Droplet backups), which also cover the `uploads` volume.
- Optional: set `BACKUP_AGE_RECIPIENT` to encrypt dumps with [age](https://age-encryption.org) (create the key pair on your own machine with `age-keygen`; `bootstrap.sh` installs `age`), and `BACKUP_S3_*` to upload each dump to an S3-compatible bucket (DigitalOcean Spaces, R2, S3…). Add a lifecycle rule on the bucket for remote retention.

Run `deploy/backup.sh` once by hand to check it works.

### Restore

```sh
cd docker
docker compose stop app
gunzip -c ../backups/featherlog-20261005T032300Z.sql.gz \
  | docker compose exec -T postgres psql -U featherlog -d featherlog -v ON_ERROR_STOP=1
docker compose start app
```

The dump includes `DROP … IF EXISTS` statements, so it restores over an existing database. Encrypted dumps (`.sql.gz.age`) are decrypted first with `age -d -i featherlog-backup.key <file> | gunzip | …`, on a machine that has the private key. In the reference setup, the [`backup-check.yml`](../.github/workflows/backup-check.yml) workflow restores the latest backup into a throwaway database every week.

## Health check

`GET /healthz` returns `{"ok":true}` (200) when the app can query the database, and `{"ok":false}` (503) when it can't. The image has a Docker `HEALTHCHECK` that uses it. Point your uptime monitor at it too.

```sh
curl -fsS https://changelog.example.com/healthz
```

## Creating API keys from the command line

Keys are normally created in **Settings → API & MCP**. For automation, the Docker image ships a small CLI that creates one for a workspace and prints the secret (attributed to the workspace owner):

```sh
docker compose exec app featherlog create-api-key <workspace-slug> [name] [scopes]

# example: a key that can only write drafts and upload images
docker compose exec app featherlog create-api-key acme "CI" posts:read,posts:write,assets:write
```

Without `scopes`, the key gets every scope except `members:admin`. From a repository checkout the same command is `pnpm --filter @featherlog/web create-api-key <workspace-slug> [name] [scopes]` (it reads `apps/web/.env.local`).

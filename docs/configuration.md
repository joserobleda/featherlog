# Configuration reference

Featherlog reads its configuration from environment variables. At startup they are validated by [`apps/web/src/lib/env.ts`](../apps/web/src/lib/env.ts). If a value is invalid, the process stops with a list of the problems.

- **Local development**: put them in `apps/web/.env.local` (start from `apps/web/.env.example`).
- **Docker Compose**: put them in `docker/.env` (start from `deploy/.env.example`). Compose passes the whole file to the app container and also uses it for variable substitution in `docker/compose.yml`.

Boolean variables accept `true`/`1` (on) and `false`/`0`/empty (off).

## Application

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test` or `production`. The Docker image sets `production`. In production, email verification is required at sign-up and auth rate limiting is enabled. |
| `DATABASE_URL` | `postgres://featherlog:featherlog@localhost:5442/featherlog` | Postgres connection string. In `docker/compose.yml` it is built from `POSTGRES_PASSWORD`, so you don't need to set it there. |
| `AUTH_SECRET` | `dev-secret-change-me-…` | Secret used to sign sessions, OAuth tokens and private-mode links. At least 16 characters. **Set a long random value in production** (`openssl rand -base64 32`). Changing it signs everyone out and invalidates private links. |
| `APP_URL` | `http://localhost:3100` | Public URL of the app: dashboard, auth, REST API and MCP (`<APP_URL>/mcp`). OAuth tokens are bound to it. Trailing slashes are stripped. |
| `PUBLIC_URL` | `APP_URL` | Host for the public changelog pages (`/<slug>`), RSS and sitemaps. See [separate hosts](self-hosting.md#separate-hosts-for-public-pages-and-widget). |
| `WIDGET_URL` | `APP_URL` | Host for `widget.js`, the widget iframe (`/_widget/…`) and the widget JSON (`/api/widget/…`). |
| `SIGNUP_MODE` | `open` | `open`: anyone can sign up. `invite`: only email addresses with an invitation. `closed`: nobody. The first user can always sign up. |
| `ALLOWED_EMAIL_DOMAINS` | — | Comma-separated email domains that can always sign up, whatever `SIGNUP_MODE` says (e.g. your company domain). Only applies to proven addresses: Google sign-in, or email verification (production with `SMTP_URL`). With neither, it has no effect — otherwise anyone could claim an address on your domain. |
| `AUTO_JOIN_WORKSPACE` | — | Slug of a workspace that new users from `ALLOWED_EMAIL_DOMAINS` join automatically as editors. |
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug` or `trace` (pino). |

## Storage

| Variable | Default | Description |
| --- | --- | --- |
| `STORAGE_DRIVER` | `local` | `local` (filesystem) or `s3` (any S3-compatible service: Cloudflare R2, AWS S3, MinIO, B2…). |
| `UPLOADS_DIR` | `./uploads` | Folder for the `local` driver. The Docker image sets `/data/uploads`, which is the `uploads` volume. Files are served from `<APP_URL>/uploads/…`. |
| `S3_ENDPOINT` | — | Endpoint of an S3-compatible service, for example `https://<account-id>.r2.cloudflarestorage.com`. Leave it empty for AWS S3. When it is set, path-style addressing is used. |
| `S3_REGION` | `auto` | Bucket region (`auto` for R2). |
| `S3_BUCKET` | — | Bucket name. Required with `s3`. |
| `S3_ACCESS_KEY_ID` | — | Required with `s3`. |
| `S3_SECRET_ACCESS_KEY` | — | Required with `s3`. |
| `S3_PUBLIC_URL` | — | Public base URL of the bucket, for example `https://files.example.com`. If it is not set, files are proxied through `<APP_URL>/uploads/…`. |

## Email

| Variable | Default | Description |
| --- | --- | --- |
| `SMTP_URL` | — | Optional SMTP connection URL (`smtps://user:pass@host:465` or `smtp://user:pass@host:587`). Without it, emails are skipped: invitations are shared as links from the dashboard, email verification is off, and magic-link sign-in / password reset are hidden. In development, `apps/web/.env.example` points it at Mailpit. |
| `MAIL_FROM` | `Featherlog <no-reply@localhost>` | Sender for verification emails, magic links, password resets and invitations. |

## Sign-in

| Variable | Default | Description |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | — | Turns on "Continue with Google" when it is set together with the secret. |
| `GOOGLE_CLIENT_SECRET` | — | See [Google sign-in](self-hosting.md#google-sign-in). |

Email and password sign-in and magic links are always available.

## Database and background jobs

| Variable | Default | Description |
| --- | --- | --- |
| `MIGRATE_ON_START` | off (**on in the Docker image**) | Apply pending database migrations when the server starts. An advisory lock makes this safe with several instances. |
| `MIGRATIONS_DIR` | `packages/db/drizzle` | Where migrations are read from. The Docker image sets `/app/migrations`. You don't normally need to change it. |
| `WORKER_MODE` | `inline` | `inline`: background jobs run inside the web process. `separate`: run a second container with the `worker` command. `off`: no jobs. |

## Server (Docker image)

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Port the server listens on inside the container. |
| `HOSTNAME` | `0.0.0.0` | Interface the server binds to inside the container. |

## Docker Compose and deploy scripts

These are read by `docker/compose.yml` and the scripts in `deploy/`, not by the app.

| Variable | Default | Description |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | — (required) | Password of the bundled Postgres. Used to build `DATABASE_URL`. |
| `FEATHERLOG_IMAGE` | `ghcr.io/joserobleda/featherlog:latest` | Image to run. `deploy/deploy.sh` sets it to the tag you deploy. |
| `APP_BIND` | `127.0.0.1` | Host interface the app port is published on. |
| `APP_PORT` | `3000` | Host port for the app. |
| `APP_DOMAIN` | `localhost` | Domain the bundled Caddy serves and gets a certificate for. Use the host of `APP_URL`. |
| `ACME_EMAIL` | — | Email for Let's Encrypt notices (Caddy). |
| `USE_CADDY` | — | `1` makes `deploy/deploy.sh` start Compose with `--profile caddy`. Set it in `docker/.env` or in the environment. |
| `BACKUP_KEEP_DAYS` | `14` | Days of compressed dumps `deploy/backup.sh` keeps on the server (`/opt/featherlog/backups`). |
| `BACKUP_AGE_RECIPIENT` | — | Optional [age](https://age-encryption.org) public key (`age1…`); dumps are encrypted to it. Keep the private key off the server. |
| `BACKUP_S3_BUCKET` | — | Optional bucket for an off-site copy of each dump. |
| `BACKUP_S3_ENDPOINT` | — | S3 endpoint for the backup bucket. |
| `BACKUP_S3_ACCESS_KEY_ID` | — | Credentials for the backup bucket. |
| `BACKUP_S3_SECRET_ACCESS_KEY` | — | |

## Development and tests

| Variable | Default | Description |
| --- | --- | --- |
| `SEED_EMAIL`, `SEED_PASSWORD`, `SEED_SLUG` | see `apps/web/scripts/seed.ts` | Override the demo user and workspace created by `pnpm db:seed`. |
| `TEST_DATABASE_URL` | — | Run the core tests against a real Postgres instead of in-memory PGlite. |
| `E2E_BASE_URL` | `http://localhost:3100` | Base URL for Playwright. |
| `E2E_START_COMMAND` | `pnpm dev` | Command Playwright uses to start the server when nothing is listening yet. |

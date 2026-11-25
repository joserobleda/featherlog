# Deploying on Coolify

[Coolify](https://coolify.io) is a self-hosted PaaS: one server, a web dashboard, automatic HTTPS and
subdomains, one-click databases and backups. It's a good fit when you host several internal tools on
the same machine.

## 1. Add Featherlog

1. In Coolify: **Projects → New Resource → Public Repository** → `https://github.com/joserobleda/featherlog`
   with build pack **Docker Compose** and compose file **`/docker/compose.coolify.yml`**.
   (Or **Docker Compose Empty** and paste [`docker/compose.coolify.yml`](../docker/compose.coolify.yml).)
2. In the `app` service, set the domain with the container port, e.g.
   `https://changelog.tools.example.com:3000`. With a wildcard domain configured in Coolify you can keep
   the generated one.
3. Environment variables (Coolify fills the database password and `AUTH_SECRET` automatically):

   | Variable | Example |
   |---|---|
   | `SIGNUP_MODE` | `invite` |
   | `ALLOWED_EMAIL_DOMAINS` | `example.com` |
   | `AUTO_JOIN_WORKSPACE` | `example` (the slug you create on first login) |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from a Google Cloud OAuth client (type *Internal* for a Workspace-only app); redirect URI `https://<domain>/api/auth/callback/google` |
   | `SMTP_URL` / `MAIL_FROM` | `smtps://user:pass@smtp.eu.mailgun.org:465` / `Product <updates@example.com>` (invitations and newsletters) |
   | `ANTHROPIC_API_KEY` | optional: Claude writes newsletter drafts ([Newsletters](newsletters.md)) |
   | `MAILGUN_WEBHOOK_SIGNING_KEY` | optional: records bounces and complaints ([Sending with Mailgun](newsletters.md#sending-with-mailgun)) |
   | `FEATHERLOG_TAG` | `latest` (releases) or `edge` (main branch) |

   If you pasted an older copy of the compose file into Coolify, paste this one again: Coolify only
   passes the variables the file lists.

4. **Deploy**. Migrations run on start; the health check uses `/healthz`.
5. Open the URL, create the first account and your workspace.

## 2. Backups

Enable **Scheduled Backups** on the `postgres` service in Coolify (local, or to an S3-compatible
destination). The `featherlog-uploads` volume holds uploaded images: include it in your server
backups/snapshots, or use `STORAGE_DRIVER=s3`.

## 3. Updates

Redeploy in Coolify with **Restart → Restart (pull latest)**, or let the GitHub release workflow do
it after each image build (`deploy-coolify` job):

1. In Coolify, **Keys & Tokens → API tokens**: create a token with the `deploy` permission. Coolify's
   API must be enabled in **Settings → Advanced**.
2. In the GitHub repository's `coolify` environment (Settings → Environments; add required
   reviewers or branch rules there if you want a gate): secret `COOLIFY_TOKEN`, variables
   `COOLIFY_URL` (`https://coolify.example.com`) and `COOLIFY_APP_URL` (Featherlog's URL, for the
   smoke test).
3. As repository variables (Settings → Secrets and variables → Actions → Variables), because the
   job's condition reads them before the environment loads: `COOLIFY_SERVICE_UUID` (from the
   service's URL, `…/service/<uuid>`) and, optionally, `COOLIFY_IMAGE_TAG`. `edge` (the default)
   deploys every push to `main`; set it to `latest`, matching `FEATHERLOG_TAG`, to deploy only `v*`
   releases.

## Resetting a forgotten password

Without SMTP, users can't reset their password by email. An owner or admin can create a reset link for them in **Settings → Team** (the key icon next to the member). If nobody can sign in to do that, open the `app` container's **Terminal** and run:

```sh
featherlog reset-password <email> [new-password]
```

Without `new-password`, a random one is printed.

## Creating API keys from the terminal

In Coolify, open the `app` container's **Terminal** and run:

```sh
featherlog create-api-key <workspace-slug> [name] [scopes]
```

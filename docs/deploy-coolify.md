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
   | `FEATHERLOG_TAG` | `latest` (releases) or `edge` (main branch) |

4. **Deploy**. Migrations run on start; the health check uses `/healthz`.
5. Open the URL, create the first account and your workspace.

## 2. Backups

Enable **Scheduled Backups** on the `postgres` service in Coolify (local, or to an S3-compatible
destination). The `featherlog-uploads` volume holds uploaded images: include it in your server
backups/snapshots, or use `STORAGE_DRIVER=s3`.

## 3. Updates

Redeploy in Coolify (it pulls the newest image for the tag), or enable automatic redeploys with the
resource's webhook from the GitHub release workflow.

## Creating API keys from the terminal

In Coolify, open the `app` container's **Terminal** and run:

```sh
featherlog create-api-key <workspace-slug> [name] [scopes]
```

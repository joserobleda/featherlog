# MCP server

Featherlog includes a [Model Context Protocol](https://modelcontextprotocol.io) server, so AI agents can work on your changelog directly. They can read past posts, draft release notes from your commits, translate posts into every language you publish in, upload screenshots and, if you allow it, publish.

- **Endpoint:** `<APP_URL>/mcp` (Streamable HTTP; stateless fallback for older clients)
- **Auth:** OAuth 2.1 (sign in with your Featherlog account) **or** a workspace API key
- Tools, resources and prompts are defined once on the server. The [REST API](api.md) and the dashboard use the same domain code, so permissions and validation are identical everywhere.

The exact URL to copy is shown in **Settings → API & MCP**.

## Authentication

### OAuth (recommended for people)

Clients that support remote MCP servers with OAuth (Claude, ChatGPT, Cursor, VS Code…) find everything themselves. Add the URL, and the client opens a Featherlog sign-in and consent screen.

Under the hood:

- Protected resource metadata (RFC 9728): `<APP_URL>/.well-known/oauth-protected-resource/mcp`
- Authorization server metadata: `<APP_URL>/.well-known/oauth-authorization-server`, with issuer `<APP_URL>/api/auth`
- Clients identify themselves with **Client ID Metadata Documents (CIMD)** or register through **dynamic client registration** (RFC 7591). No manual client setup is needed.
- Authorization code flow with PKCE. Access tokens are short-lived JWTs bound to the `<APP_URL>/mcp` resource, with refresh tokens for longer sessions.
- Scopes are the same as the [API scopes](api.md#scopes). An OAuth session can do what **both** your workspace role and the granted scopes allow. An editor who grants `settings:write` still can't change settings.
- If your account belongs to several workspaces, tools take a `workspace` argument (the slug). The agent can call `list_workspaces` to find it.
- Posts created through OAuth show the app as their origin, for example "Claude (MCP)".

### API key (for headless agents and simple clients)

Send a workspace key from **Settings → API & MCP** as a bearer token:

```
Authorization: Bearer fl_live_…
```

The key is tied to one workspace and limited by its scopes. This is the right choice for CI and for scheduled or unattended agents.

## Connecting clients

Replace `https://changelog.example.com` with your `APP_URL`.

### Claude (web and desktop)

**Settings → Connectors → Add custom connector**, paste `https://changelog.example.com/mcp` and click *Connect*. Sign in to Featherlog and approve. You don't need a key. On Team and Enterprise plans, an owner may have to add the connector for the organization first.

### Claude Code

```sh
claude mcp add --transport http featherlog https://changelog.example.com/mcp
```

Then run `/mcp` in Claude Code and pick *featherlog* to sign in. To use an API key instead:

```sh
claude mcp add --transport http featherlog https://changelog.example.com/mcp \
  --header "Authorization: Bearer fl_live_…"
```

### Cursor

`~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project). With OAuth:

```json
{
  "mcpServers": {
    "featherlog": { "url": "https://changelog.example.com/mcp" }
  }
}
```

With an API key:

```json
{
  "mcpServers": {
    "featherlog": {
      "url": "https://changelog.example.com/mcp",
      "headers": { "Authorization": "Bearer fl_live_…" }
    }
  }
}
```

### ChatGPT

Custom connectors need developer mode: **Settings → Apps & Connectors → Advanced settings → Developer mode**. Then create a connector with the MCP server URL `https://changelog.example.com/mcp` and OAuth authentication, and sign in when prompted. The menu names may differ slightly depending on your plan.

### Other clients

- **Remote (HTTP) with custom headers:** URL `<APP_URL>/mcp` plus the header `Authorization: Bearer fl_live_…`.
- **Local stdio only:** use the bridge below.

### Local stdio bridge: `@featherlog/mcp`

For clients that only launch local servers, [`@featherlog/mcp`](../packages/mcp/README.md) runs on your machine. It speaks stdio to the client and forwards everything to `<url>/mcp` with an API key.

```sh
npx -y @featherlog/mcp --url https://changelog.example.com --key fl_live_…
```

Or use the environment variables `FEATHERLOG_URL` and `FEATHERLOG_API_KEY`. Example for `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "featherlog": {
      "command": "npx",
      "args": ["-y", "@featherlog/mcp"],
      "env": {
        "FEATHERLOG_URL": "https://changelog.example.com",
        "FEATHERLOG_API_KEY": "fl_live_…"
      }
    }
  }
}
```

It requires Node.js 20 or newer. Set `FEATHERLOG_DEBUG=1` to log protocol errors to stderr.

## Tools

| Tool | Description |
| --- | --- |
| `list_workspaces` | Workspaces you can manage (with your role). |
| `get_workspace` | Settings, enabled languages, categories (names per language) and `canPublish`. Agents should call this before writing. |
| `list_posts` | Posts, newest first. Filter by `status`, `locale`, `missingLocale` (not yet translated), `q` (text search). Paginated with `cursor`. |
| `get_post` | A post with all its translations and its `version`. |
| `create_post` | Creates a **draft** with one translation per language. Takes an optional planned `publishedAt`. |
| `update_post` | Partial update of translations (set a locale to `null` to remove it) or `publishedAt`. |
| `set_translation` | Creates or replaces one language's title and content. |
| `publish_post` | Publishes now. |
| `schedule_post` | Publishes at a future date. |
| `unpublish_post` | Turns a published or scheduled post back into a draft. |
| `delete_post` | Deletes a post. The tool tells the agent to confirm with the user first. |
| `preview_markdown` | Renders Markdown exactly like the public page, to check categories and embeds. |
| `list_categories` | Categories with names per language and color. |
| `create_category` | Creates a category (`color`, `names` per locale). |
| `upload_image` | Uploads an image from a public URL or base64 data. Returns its URL and a ready-made `![](url)`. |
| `get_widget_settings` | Widget behavior settings and the embed snippet. |
| `update_widget_settings` | Changes the badge delay, posts shown, count expiry, soft hide, eye-catcher or color. |

Write tools accept `expectedVersion`, the `version` from the last read. If someone edited the post in the meantime, the call fails instead of overwriting their changes.

## Resources

| URI | Description |
| --- | --- |
| `featherlog://guide/markdown` | The supported Markdown syntax: categories, video embeds, image sizing… (same as [markdown.md](markdown.md)) |
| `featherlog://workspace` | Workspace overview: languages, categories and the 10 latest posts. |

## Prompts

| Prompt | Arguments | What it does |
| --- | --- | --- |
| `release_notes_from_changes` | `changes`, optional `audience` | Turns commits, PR titles or a diff summary into a user-facing draft in every enabled language, labeled with existing categories, then asks before publishing. |
| `translate_post` | `id` | Translates a post into every enabled language it's missing, keeping Markdown, media and category labels intact. |

## Safety model

- **Drafts by default.** `create_post` always creates a draft. Publishing is a separate tool call.
- **Publishing is opt-in per workspace.** While **Settings → API & MCP → Integrations can publish** is off (the default), agents can't publish, schedule, unpublish, or edit or delete a live post. They leave a draft and tell you to review it in the dashboard.
- **Scopes and roles.** API keys only get the scopes you pick. OAuth sessions are limited to the intersection of the granted scopes and your role.
- **No silent overwrites.** `expectedVersion` protects human edits. Every post records whether it was created in the panel, by the API or by MCP, and by which key or app.
- **Revocation.** Revoke API keys in **Settings → API & MCP → API keys**. Disconnect OAuth apps in **Settings → API & MCP → Authorized apps**: this removes the consent and revokes refresh tokens immediately. Access tokens already issued expire within the hour.
- **Server-side checks.** URL image imports refuse private network addresses. All Markdown is sanitized when it is rendered.

## Example prompts

- "Here are the PRs merged this week: … Write a changelog post for our customers and save it as a draft."
- "Translate the latest post into every language we publish in."
- "Which published posts are missing a German translation? Translate them."
- "Draft a post announcing the new CSV export. Use this screenshot: https://example.com/export.png. Tag it New and schedule it for Monday 9:00 CET."
- "Rewrite the draft about dark mode to be shorter and friendlier, without touching the Spanish version."
- "Set the widget to show 10 posts and use the progressive eye-catcher."

## Troubleshooting

- **401 or a sign-in loop:** make sure `APP_URL` matches the public URL exactly (scheme and host). OAuth tokens are bound to `<APP_URL>/mcp`.
- **"Missing permission: posts:write":** the client didn't request or get Featherlog scopes, or your role doesn't allow the action. Reconnect and approve all permissions, or check the key's scopes.
- **"Publishing from integrations is disabled":** this is the safety switch working as intended. Publish from the dashboard, or turn on *Integrations can publish*.
- **"Specify a workspace":** your account has several workspaces. Mention the workspace slug in your prompt.

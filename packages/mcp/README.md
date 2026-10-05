# @featherlog/mcp

Local (stdio) [MCP](https://modelcontextprotocol.io) server for [Featherlog](https://github.com/joserobleda/featherlog), the open-source lightweight changelog. Let AI agents draft, translate, schedule and publish your changelog posts.

It's a thin **bridge**: it runs on your machine, speaks MCP over stdio to your client, and forwards every request to your Featherlog instance's hosted MCP endpoint (`<url>/mcp`, Streamable HTTP), authenticated with a workspace API key. Tools, resources and prompts are defined once on the server, so the bridge always matches the version of Featherlog you run.

> **Does your client support remote MCP servers?** (Claude.ai, Claude Desktop connectors, Claude Code, Cursor, VS Code…) Then you don't need this package: add `https://<your-changelog>/mcp` as a remote server and sign in with OAuth. Use `@featherlog/mcp` for clients that only run local servers, or when you'd rather use an API key.

## Requirements

- Node.js 20 or newer
- A Featherlog workspace API key (`fl_live_…`) — create one in the dashboard under **Settings → API keys**

## Usage

```sh
npx -y @featherlog/mcp --url https://changelog.example.com --key fl_live_xxx
```

| Flag            | Env var              | Description                                                   |
| --------------- | -------------------- | ------------------------------------------------------------- |
| `--url <url>`   | `FEATHERLOG_URL`     | Base URL of your Featherlog instance (`…/mcp` is also accepted) |
| `--key <key>`   | `FEATHERLOG_API_KEY` | Workspace API key                                             |
| `-h, --help`    |                      | Show help                                                     |
| `-v, --version` |                      | Print the version                                             |

Flags take precedence over env vars. Set `FEATHERLOG_DEBUG=1` to log protocol errors to stderr.

### Claude Desktop

Add to `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "featherlog": {
      "command": "npx",
      "args": ["-y", "@featherlog/mcp", "--url", "https://changelog.example.com", "--key", "fl_live_…"]
    }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project). Using env vars keeps the key out of the args:

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

### Other clients

Any client that launches stdio servers works the same way: command `npx`, args `-y @featherlog/mcp`, plus `--url`/`--key` or the env vars above.

## What you get

Everything the hosted endpoint exposes for the key's workspace, for example:

- **Tools** — `get_workspace`, `list_posts`, `get_post`, `create_post`, `update_post`, `set_translation`, `publish_post`, `schedule_post`, `unpublish_post`, categories, widget settings…
- **Resources** — `featherlog://guide/markdown` (supported Markdown syntax), `featherlog://workspace` (languages, categories, latest posts)
- **Prompts** — `release_notes_from_changes`, `translate_post`

The API key acts with the permissions it was created with; if your workspace disables publishing for integrations, agents will leave drafts for you to review.

## Programmatic use

```ts
import { createBridge } from "@featherlog/mcp";

const bridge = await createBridge({ url: "https://changelog.example.com", apiKey: "fl_live_…" });
bridge.serve(); // stdio of the current process (or pass { transport })
```

## License

AGPL-3.0-only

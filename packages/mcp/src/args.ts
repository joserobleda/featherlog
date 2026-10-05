import { parseArgs } from "node:util";

export const USAGE = `featherlog-mcp — local (stdio) MCP server for a Featherlog changelog

Bridges MCP clients that only support local servers to the remote MCP
endpoint of a Featherlog instance (<url>/mcp), authenticated with a
workspace API key.

Usage:
  npx -y @featherlog/mcp --url https://changelog.example.com --key fl_live_xxx

Options:
  --url <url>    Base URL of your Featherlog instance   (env: FEATHERLOG_URL)
  --key <key>    Workspace API key, starts with fl_live_ (env: FEATHERLOG_API_KEY)
  -h, --help     Show this help
  -v, --version  Print the version

Create an API key in your Featherlog dashboard (Settings → API keys).
Clients that support remote MCP servers can connect to <url>/mcp directly
and sign in with OAuth instead.`;

export type CliCommand =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "run"; url: string; apiKey: string; warnings: string[] }
  | { kind: "error"; message: string };

/** Normalises a Featherlog base URL to its MCP endpoint (`<url>/mcp`). */
export function toMcpEndpoint(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error(
      `Invalid --url "${raw}": expected something like https://changelog.example.com`,
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error(`Invalid --url "${raw}": only http(s) URLs are supported`);
  url.hash = "";
  url.search = "";
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith("/mcp") ? path : `${path}/mcp`;
  return url;
}

/** Parses CLI flags (falling back to env vars). Never throws. */
export function parseCliArgs(
  argv: string[],
  env: Record<string, string | undefined> = {},
): CliCommand {
  let values: { url?: string; key?: string; help?: boolean; version?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        url: { type: "string" },
        key: { type: "string" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (err) {
    return { kind: "error", message: (err as Error).message };
  }
  if (values.help) return { kind: "help" };
  if (values.version) return { kind: "version" };

  const url = (values.url ?? env.FEATHERLOG_URL ?? "").trim();
  const apiKey = (values.key ?? env.FEATHERLOG_API_KEY ?? "").trim();
  if (!url)
    return {
      kind: "error",
      message: "Missing Featherlog URL: pass --url <url> or set FEATHERLOG_URL",
    };
  if (!apiKey)
    return {
      kind: "error",
      message: "Missing API key: pass --key <key> or set FEATHERLOG_API_KEY",
    };
  try {
    toMcpEndpoint(url);
  } catch (err) {
    return { kind: "error", message: (err as Error).message };
  }
  const warnings: string[] = [];
  if (!apiKey.startsWith("fl_"))
    warnings.push(
      'The API key does not look like a Featherlog key (expected "fl_live_…"); trying anyway.',
    );
  return { kind: "run", url, apiKey, warnings };
}

import {
  Client,
  type FetchLike,
  type Implementation,
  ProtocolError,
  ProtocolErrorCode,
  type ServerCapabilities,
  StreamableHTTPClientTransport,
  type Tool,
  UnauthorizedError,
} from "@modelcontextprotocol/client";
import { type CallToolResult, Server, type Transport } from "@modelcontextprotocol/server";
import { type StdioServerHandle, serveStdio } from "@modelcontextprotocol/server/stdio";
import { version } from "../package.json";
import { toMcpEndpoint } from "./args";

export const VERSION: string = version;

export interface BridgeOptions {
  /** Base URL of the Featherlog instance (`https://changelog.example.com`) or its `/mcp` endpoint. */
  url: string;
  /** Workspace API key (`fl_live_…`), sent as `Authorization: Bearer <key>`. */
  apiKey: string;
  /** Custom fetch for the remote connection (tests, proxies). */
  fetch?: FetchLike;
  /** Out-of-band errors (remote transport hiccups, local protocol errors). Defaults to silence. */
  onerror?: (error: Error) => void;
}

export interface ServeOptions {
  /** Local transport; defaults to stdio of the current process. */
  transport?: Transport;
}

export interface Bridge {
  /** The connected remote client. */
  readonly client: Client;
  /** Remote server identity, forwarded verbatim to local clients. */
  readonly serverInfo: Implementation;
  /** Remote server instructions, forwarded verbatim to local clients. */
  readonly instructions: string | undefined;
  /** Capabilities advertised locally (subset of the remote ones that the bridge forwards). */
  readonly capabilities: ServerCapabilities;
  /** Tools fetched at startup. */
  readonly tools: Tool[];
  /** Builds a fresh local `Server` whose handlers forward to the remote client. */
  createServer(): Server;
  /** Serves the bridge over stdio (or the given transport). */
  serve(options?: ServeOptions): StdioServerHandle;
  /** Closes the local server (if serving) and the remote connection. */
  close(): Promise<void>;
}

/** Raised when the remote Featherlog endpoint cannot be reached or rejects the key. */
export class BridgeConnectError extends Error {
  override name = "BridgeConnectError";
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Remote failures must not crash the bridge: MCP errors from the remote are
 * re-thrown as-is (same code/message/data); anything else (network, timeouts)
 * becomes an internal error answered to the local client.
 */
function toProtocolError(err: unknown, what: string): ProtocolError {
  if (err instanceof ProtocolError) return err;
  return new ProtocolError(
    ProtocolErrorCode.InternalError,
    `Featherlog remote error during ${what}: ${describe(err)}`,
  );
}

function pickCapabilities(remote: ServerCapabilities | undefined): ServerCapabilities {
  // listChanged/subscribe are not forwarded: the bridge doesn't relay notifications.
  const caps: ServerCapabilities = {};
  if (remote?.tools) caps.tools = {};
  if (remote?.resources) caps.resources = {};
  if (remote?.prompts) caps.prompts = {};
  if (remote?.completions) caps.completions = {};
  return caps;
}

/** Connects to `<url>/mcp` and prepares a local server that forwards everything to it. */
export async function createBridge(options: BridgeOptions): Promise<Bridge> {
  const endpoint = toMcpEndpoint(options.url);
  const client = new Client(
    { name: "featherlog-mcp-bridge", version: VERSION },
    { versionNegotiation: { mode: "auto" } },
  );
  client.onerror = (err) => options.onerror?.(err);

  const transport = new StreamableHTTPClientTransport(endpoint, {
    authProvider: { token: async () => options.apiKey },
    fetch: options.fetch,
  });

  try {
    await client.connect(transport);
  } catch (err) {
    await client.close().catch(() => {});
    if (err instanceof UnauthorizedError || /\b401\b|unauthori[sz]ed/i.test(describe(err)))
      throw new BridgeConnectError(
        `Featherlog rejected the API key (${endpoint.href}). Check that it is valid and not revoked.`,
      );
    throw new BridgeConnectError(`Could not connect to ${endpoint.href}: ${describe(err)}`);
  }

  const remoteCaps = client.getServerCapabilities();
  const capabilities = pickCapabilities(remoteCaps);
  const serverInfo: Implementation = client.getServerVersion() ?? {
    name: "featherlog",
    version: "unknown",
  };
  const instructions = client.getInstructions();

  // Prefetch the catalogue: fails fast on a broken endpoint and warms the
  // client's tool index (used by callTool for output validation).
  let tools: Tool[] = [];
  try {
    const [toolList] = await Promise.all([
      capabilities.tools ? client.listTools() : { tools: [] },
      capabilities.resources ? client.listResources() : undefined,
      capabilities.resources ? client.listResourceTemplates() : undefined,
      capabilities.prompts ? client.listPrompts() : undefined,
    ]);
    tools = toolList.tools;
  } catch (err) {
    await client.close().catch(() => {});
    throw new BridgeConnectError(
      `Connected to ${endpoint.href} but listing failed: ${describe(err)}`,
    );
  }

  const outputSchemaOf = (name: string) => tools.find((t) => t.name === name)?.outputSchema;
  const cursorOf = (params: { cursor?: string } | undefined) =>
    params?.cursor ? { cursor: params.cursor } : undefined;

  function createServer(): Server {
    const server = new Server(serverInfo, { capabilities, instructions });
    server.onerror = (err) => options.onerror?.(err);

    if (capabilities.tools) {
      server.setRequestHandler("tools/list", async (req) => {
        try {
          const r = await client.listTools(cursorOf(req.params));
          if (!r.nextCursor && !req.params?.cursor) tools = r.tools;
          return { tools: r.tools, ...(r.nextCursor ? { nextCursor: r.nextCursor } : {}) };
        } catch (err) {
          throw toProtocolError(err, "tools/list");
        }
      });
      server.setRequestHandler("tools/call", async (req) => {
        const { name, arguments: args } = req.params;
        let result: CallToolResult;
        try {
          const r = await client.callTool({ name, arguments: args });
          result = {
            content: r.content,
            ...(r.structuredContent !== undefined
              ? { structuredContent: r.structuredContent }
              : {}),
            ...(r.isError ? { isError: true } : {}),
          } as CallToolResult;
        } catch (err) {
          if (err instanceof ProtocolError) throw err;
          // Transport/SDK failure: report as a tool error so the agent can see it.
          result = {
            isError: true,
            content: [{ type: "text", text: `Featherlog request failed: ${describe(err)}` }],
          };
        }
        return server.projectCallToolResult(result, outputSchemaOf(name));
      });
    }

    if (capabilities.resources) {
      server.setRequestHandler("resources/list", async (req) => {
        try {
          const r = await client.listResources(cursorOf(req.params));
          return { resources: r.resources, ...(r.nextCursor ? { nextCursor: r.nextCursor } : {}) };
        } catch (err) {
          throw toProtocolError(err, "resources/list");
        }
      });
      server.setRequestHandler("resources/templates/list", async (req) => {
        try {
          const r = await client.listResourceTemplates(cursorOf(req.params));
          return {
            resourceTemplates: r.resourceTemplates,
            ...(r.nextCursor ? { nextCursor: r.nextCursor } : {}),
          };
        } catch (err) {
          throw toProtocolError(err, "resources/templates/list");
        }
      });
      server.setRequestHandler("resources/read", async (req) => {
        try {
          const r = await client.readResource({ uri: req.params.uri }, { cacheMode: "bypass" });
          return { contents: r.contents };
        } catch (err) {
          throw toProtocolError(err, "resources/read");
        }
      });
    }

    if (capabilities.prompts) {
      server.setRequestHandler("prompts/list", async (req) => {
        try {
          const r = await client.listPrompts(cursorOf(req.params));
          return { prompts: r.prompts, ...(r.nextCursor ? { nextCursor: r.nextCursor } : {}) };
        } catch (err) {
          throw toProtocolError(err, "prompts/list");
        }
      });
      server.setRequestHandler("prompts/get", async (req) => {
        try {
          const r = await client.getPrompt({
            name: req.params.name,
            arguments: req.params.arguments,
          });
          return {
            messages: r.messages,
            ...(r.description !== undefined ? { description: r.description } : {}),
          };
        } catch (err) {
          throw toProtocolError(err, "prompts/get");
        }
      });
    }

    if (capabilities.completions) {
      server.setRequestHandler("completion/complete", async (req) => {
        try {
          const r = await client.complete({
            ref: req.params.ref,
            argument: req.params.argument,
            ...(req.params.context ? { context: req.params.context } : {}),
          });
          return { completion: r.completion };
        } catch (err) {
          throw toProtocolError(err, "completion/complete");
        }
      });
    }

    return server;
  }

  let handle: StdioServerHandle | undefined;
  let closed = false;

  return {
    client,
    serverInfo,
    instructions,
    capabilities,
    get tools() {
      return tools;
    },
    createServer,
    serve(serveOptions = {}) {
      handle = serveStdio(() => createServer(), {
        transport: serveOptions.transport,
        onerror: (err) => options.onerror?.(err),
      });
      return handle;
    },
    async close() {
      if (closed) return;
      closed = true;
      await handle?.close().catch(() => {});
      await client.close().catch(() => {});
    },
  };
}

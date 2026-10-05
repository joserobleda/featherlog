import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { createMcpHandler, McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { z } from "zod";

export const TEST_KEY = "fl_live_test_key";

export interface FakeRemote {
  url: string;
  /** Authorization header of every HTTP request received. */
  authHeaders: (string | undefined)[];
  /** Arguments of every `echo` tool call. */
  echoCalls: unknown[];
  close(): Promise<void>;
}

function buildServer(remote: FakeRemote) {
  const server = new McpServer(
    { name: "fake-featherlog", title: "Fake Featherlog", version: "9.9.9" },
    { instructions: "Fake instructions for tests." },
  );
  server.registerTool(
    "echo",
    {
      title: "Echo",
      description: "Echoes a message back.",
      inputSchema: z.object({
        message: z.string().describe("What to echo"),
        times: z.number().int().min(1).max(5).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ message, times }) => {
      remote.echoCalls.push({ message, times });
      const data = { echoed: message.repeat(times ?? 1) };
      return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
    },
  );
  server.registerTool(
    "explode",
    { description: "Always fails.", inputSchema: z.object({}) },
    async () => {
      throw new Error("kaboom");
    },
  );
  server.registerResource(
    "guide",
    "fake://guide",
    { title: "Guide", description: "A guide", mimeType: "text/markdown" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: "# Guide" }] }),
  );
  server.registerResource(
    "post",
    new ResourceTemplate("fake://posts/{id}", { list: undefined }),
    { title: "Post", mimeType: "application/json" },
    async (uri, vars) => ({
      contents: [
        { uri: uri.href, mimeType: "application/json", text: JSON.stringify({ id: vars.id }) },
      ],
    }),
  );
  server.registerPrompt(
    "greet",
    {
      title: "Greet",
      description: "Say hi.",
      argsSchema: z.object({ name: z.string().describe("Who to greet") }),
    },
    ({ name }) => ({
      messages: [{ role: "user", content: { type: "text", text: `Say hi to ${name}` } }],
    }),
  );
  return server;
}

async function toRequest(req: IncomingMessage, base: string): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) for (const item of v) headers.append(k, item);
    else if (v !== undefined) headers.set(k, v);
  }
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  return new Request(new URL(req.url ?? "/", base), {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
  });
}

async function writeResponse(res: ServerResponse, response: Response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (!response.body) return void res.end();
  const reader = response.body.getReader();
  res.on("close", () => void reader.cancel().catch(() => {}));
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
}

/** A v2 MCP server over real HTTP (random port) with one tool/resource/prompt, gated by `TEST_KEY`. */
export async function startFakeRemote(): Promise<FakeRemote> {
  const remote: FakeRemote = {
    url: "",
    authHeaders: [],
    echoCalls: [],
    close: async () => {},
  };
  const handler = createMcpHandler(() => buildServer(remote));
  const http = createServer((req, res) => {
    void (async () => {
      const auth = req.headers.authorization;
      remote.authHeaders.push(auth);
      if (auth !== `Bearer ${TEST_KEY}`) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32001, message: "Invalid API key" },
            id: null,
          }),
        );
        return;
      }
      if (!req.url?.startsWith("/mcp")) {
        res.writeHead(404).end();
        return;
      }
      await writeResponse(res, await handler.fetch(await toRequest(req, remote.url)));
    })().catch((err) => {
      if (!res.headersSent) res.writeHead(500);
      res.end(String(err));
    });
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  remote.url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  remote.close = async () => {
    await handler.close();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  };
  return remote;
}

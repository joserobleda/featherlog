// Manual MCP smoke test: MCP_URL=http://localhost:3100/mcp FL_KEY=fl_live_… npx tsx test/mcp-smoke.ts
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const url = process.env.MCP_URL ?? "http://localhost:3100/mcp";
const key = process.env.FL_KEY!;
const client = new Client({ name: "featherlog-smoke", version: "0.0.1" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${key}` } } }),
);
const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));
const ws = await client.callTool({ name: "get_workspace", arguments: {} });
console.log("workspace:", JSON.stringify(ws.structuredContent).slice(0, 160));
const created = await client.callTool({
  name: "create_post",
  arguments: { translations: { en: { title: "Created by an agent", contentMd: "[New]\n\nHello from **MCP**." } } },
});
const post = created.structuredContent as { id: string; version: number; createdVia: string };
console.log("created:", post.id, post.createdVia);
const pub = await client.callTool({ name: "publish_post", arguments: { id: post.id } });
console.log("publish (should be forbidden by default):", pub.isError, JSON.stringify(pub.content).slice(0, 160));
const res = await client.readResource({ uri: "featherlog://guide/markdown" });
console.log("guide length:", (res.contents[0] as { text: string }).text.length);
const prompts = await client.listPrompts();
console.log("prompts:", prompts.prompts.map((p) => p.name).join(", "));
await client.close();

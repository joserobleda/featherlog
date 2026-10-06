import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, test } from "@playwright/test";
import { fixture } from "./fixture";

test("MCP: an agent drafts and translates a post; publishing goes to review by default", async ({
  baseURL,
}) => {
  const f = fixture();
  const client = new Client({ name: "e2e-agent", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${f.apiKey}` } },
    }),
  );
  try {
    const tools = (await client.listTools()).tools.map((t) => t.name);
    expect(tools).toEqual(
      expect.arrayContaining([
        "create_post",
        "set_translation",
        "publish_post",
        "request_review",
        "upload_image",
      ]),
    );

    const created = await client.callTool({
      name: "create_post",
      arguments: {
        translations: {
          en: { title: "Agent-written update", contentMd: "[New]\n\nWritten by an agent." },
        },
      },
    });
    const post = created.structuredContent as { id: string; version: number; createdVia: string };
    expect(post.createdVia).toBe("mcp");

    const translated = await client.callTool({
      name: "set_translation",
      arguments: {
        id: post.id,
        locale: "es",
        title: "Novedad escrita por un agente",
        contentMd: "[Nuevo]\n\nEscrita por un agente.",
        expectedVersion: post.version,
      },
    });
    expect(translated.isError).toBeFalsy();

    const publish = await client.callTool({ name: "publish_post", arguments: { id: post.id } });
    expect(publish.isError).toBeFalsy();
    const queued = publish.structuredContent as {
      status: string;
      adminUrl: string;
      pendingReviewCount: number;
    };
    expect(queued.status).toBe("in_review");
    expect(queued.adminUrl).toContain(`/posts/${post.id}`);
    expect(queued.pendingReviewCount).toBeGreaterThanOrEqual(1);
    const queue = await client.callTool({
      name: "list_posts",
      arguments: { status: "in_review" },
    });
    const listed = queue.structuredContent as {
      items: { id: string }[];
      pendingReviewCount: number;
    };
    expect(listed.items.map((p) => p.id)).toContain(post.id);
    expect(listed.pendingReviewCount).toBe(queued.pendingReviewCount);

    const guide = await client.readResource({ uri: "featherlog://guide/markdown" });
    expect((guide.contents[0] as { text: string }).text).toContain("[");
  } finally {
    await client.close();
  }
});

test("MCP: unauthenticated requests get an OAuth challenge", async ({ request }) => {
  const res = await request.post("/mcp", {
    data: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
  });
  expect(res.status()).toBe(401);
  expect(res.headers()["www-authenticate"]).toContain("resource_metadata=");
  const meta = await (await request.get("/.well-known/oauth-protected-resource/mcp")).json();
  expect(meta.resource).toMatch(/\/mcp$/);
});

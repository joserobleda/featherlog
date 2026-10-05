/**
 * End-to-end: spawns the built `featherlog-mcp` binary and bridges to a real
 * Featherlog instance. Opt-in:
 *
 *   FEATHERLOG_E2E_URL=http://localhost:3100 FEATHERLOG_E2E_KEY=fl_live_… pnpm vitest run --project mcp
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.FEATHERLOG_E2E_URL;
const key = process.env.FEATHERLOG_E2E_KEY;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "dist/cli.js");

describe.skipIf(!url || !key)("featherlog-mcp e2e (real instance)", () => {
  for (const mode of ["legacy", "auto"] as const) {
    describe(`local client negotiation: ${mode}`, () => {
      let client: Client;

      beforeAll(async () => {
        if (!existsSync(cli)) execFileSync(process.execPath, [join(root, "build.mjs")]);
        client = new Client({ name: "e2e", version: "0.0.0" }, { versionNegotiation: { mode } });
        await client.connect(
          new StdioClientTransport({
            command: process.execPath,
            args: [cli, "--url", url!, "--key", key!],
            stderr: "ignore",
          }),
        );
      });
      afterAll(async () => {
        await client?.close();
      });

      it("forwards server identity and instructions", () => {
        expect(client.getServerVersion()?.name).toBe("featherlog");
        expect(client.getInstructions()).toContain("Featherlog");
      });

      it("lists the hosted tools, resources and prompts", async () => {
        const { tools } = await client.listTools();
        const names = tools.map((t) => t.name);
        expect(names).toEqual(
          expect.arrayContaining(["get_workspace", "list_posts", "create_post"]),
        );
        const { resources } = await client.listResources();
        expect(resources.map((r) => r.uri)).toContain("featherlog://guide/markdown");
        const { prompts } = await client.listPrompts();
        expect(prompts.map((p) => p.name)).toContain("release_notes_from_changes");
      });

      it("calls get_workspace and list_posts", async () => {
        const ws = await client.callTool({ name: "get_workspace", arguments: {} });
        expect(ws.isError).toBeFalsy();
        expect(ws.structuredContent).toBeTypeOf("object");
        const posts = await client.callTool({ name: "list_posts", arguments: { limit: 3 } });
        expect(posts.isError).toBeFalsy();
        const text = (posts.content[0] as { text: string }).text;
        expect(JSON.parse(text)).toBeTypeOf("object");
      });

      it("reads a resource and gets a prompt", async () => {
        const guide = await client.readResource({ uri: "featherlog://guide/markdown" });
        expect((guide.contents[0] as { text: string }).text.length).toBeGreaterThan(50);
        const prompt = await client.getPrompt({
          name: "translate_post",
          arguments: { id: "post_123" },
        });
        expect(JSON.stringify(prompt.messages)).toContain("post_123");
      });
    });
  }
});

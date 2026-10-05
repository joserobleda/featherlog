import { execFileSync, spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type FakeRemote, startFakeRemote, TEST_KEY } from "./fake-remote";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "dist/cli.js");

function run(args: string[], env: Record<string, string> = {}) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], {
      env: { PATH: process.env.PATH ?? "", ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end();
  });
}

describe("featherlog-mcp binary", () => {
  let remote: FakeRemote;

  beforeAll(async () => {
    execFileSync(process.execPath, [join(root, "build.mjs")]);
    remote = await startFakeRemote();
  });
  afterAll(async () => {
    await remote.close();
  });

  it("prints usage to stderr, keeping stdout clean", async () => {
    const r = await run(["--help"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("--url");
  });

  it("prints the version", async () => {
    const r = await run(["--version"]);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("exits 2 with a helpful message on bad arguments", async () => {
    const r = await run([]);
    expect(r.code).toBe(2);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("FEATHERLOG_URL");
  });

  it("exits 1 when the key is rejected", async () => {
    const r = await run(["--url", remote.url, "--key", "fl_live_bad"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("rejected the API key");
  });

  it("exits cleanly when stdin closes", async () => {
    const r = await run([], { FEATHERLOG_URL: remote.url, FEATHERLOG_API_KEY: TEST_KEY });
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });

  it("serves the remote tools over stdio", async () => {
    const client = new Client({ name: "cli-test", version: "0.0.0" });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [cli, "--url", remote.url, "--key", TEST_KEY],
        stderr: "ignore",
      }),
    );
    expect(client.getServerVersion()?.name).toBe("fake-featherlog");
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("echo");
    const r = await client.callTool({ name: "echo", arguments: { message: "stdio" } });
    expect(r.structuredContent).toEqual({ echoed: "stdio" });
    await client.close();
  });
});

import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { type Bridge, BridgeConnectError, createBridge } from "../src/index";
import { type FakeRemote, startFakeRemote, TEST_KEY } from "./fake-remote";

let remote: FakeRemote;

beforeAll(async () => {
  remote = await startFakeRemote();
});
afterAll(async () => {
  await remote.close();
});

async function connectLocal(bridge: Bridge, mode: "legacy" | "auto") {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  bridge.serve({ transport: serverSide });
  const client = new Client(
    { name: "local-test", version: "0.0.0" },
    { versionNegotiation: { mode } },
  );
  await client.connect(clientSide);
  return client;
}

describe.each(["legacy", "auto"] as const)("bridge (local client era: %s)", (mode) => {
  let bridge: Bridge;
  let client: Client;

  beforeAll(async () => {
    bridge = await createBridge({ url: remote.url, apiKey: TEST_KEY });
    client = await connectLocal(bridge, mode);
  });
  afterAll(async () => {
    await client.close();
    await bridge.close();
  });

  it("negotiates the expected local era", () => {
    expect(client.getProtocolEra()).toBe(mode === "auto" ? "modern" : "legacy");
    // the bridge always speaks 2026-07-28 to the remote when it can
    expect(bridge.client.getProtocolEra()).toBe("modern");
  });

  it("forwards the remote identity and instructions", () => {
    expect(client.getServerVersion()).toMatchObject({ name: "fake-featherlog", version: "9.9.9" });
    expect(client.getInstructions()).toBe("Fake instructions for tests.");
    expect(client.getServerCapabilities()).toMatchObject({ tools: {}, resources: {}, prompts: {} });
  });

  it("lists tools with their schemas passed through verbatim", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["echo", "explode"]);
    const remoteTools = (await bridge.client.listTools()).tools;
    const echo = tools.find((t) => t.name === "echo");
    expect(echo).toEqual(remoteTools.find((t) => t.name === "echo"));
    expect(echo?.inputSchema.properties).toMatchObject({
      message: { type: "string", description: "What to echo" },
    });
    expect(echo?.annotations?.readOnlyHint).toBe(true);
  });

  it("forwards tool calls and their results", async () => {
    const before = remote.echoCalls.length;
    const result = await client.callTool({ name: "echo", arguments: { message: "hi", times: 2 } });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ echoed: "hihi" });
    expect(result.content).toEqual([{ type: "text", text: '{"echoed":"hihi"}' }]);
    expect(remote.echoCalls.slice(before)).toEqual([{ message: "hi", times: 2 }]);
  });

  it("forwards tool errors as isError results", async () => {
    const result = await client.callTool({ name: "explode", arguments: {} });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("kaboom");
  });

  it("reports remote validation failures without crashing", async () => {
    const outcome = await client
      .callTool({ name: "echo", arguments: { times: 99 } })
      .then((r) => ({ isError: r.isError, text: JSON.stringify(r.content) }))
      .catch((err: Error) => ({ isError: true, text: err.message }));
    expect(outcome.isError).toBe(true);
    // the bridge keeps working afterwards
    expect(
      (await client.callTool({ name: "echo", arguments: { message: "ok" } })).isError,
    ).toBeFalsy();
  });

  it("lists and reads resources and templates", async () => {
    const { resources } = await client.listResources();
    expect(resources).toEqual([
      expect.objectContaining({ uri: "fake://guide", name: "guide", mimeType: "text/markdown" }),
    ]);
    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates).toEqual([
      expect.objectContaining({ uriTemplate: "fake://posts/{id}", name: "post" }),
    ]);
    const guide = await client.readResource({ uri: "fake://guide" });
    expect(guide.contents).toEqual([
      { uri: "fake://guide", mimeType: "text/markdown", text: "# Guide" },
    ]);
    const post = await client.readResource({ uri: "fake://posts/42" });
    expect(JSON.parse((post.contents[0] as { text: string }).text)).toEqual({ id: "42" });
  });

  it("returns an MCP error for unknown resources", async () => {
    await expect(client.readResource({ uri: "nope://missing" })).rejects.toThrow();
  });

  it("lists and gets prompts", async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts).toEqual([
      expect.objectContaining({
        name: "greet",
        description: "Say hi.",
        arguments: [expect.objectContaining({ name: "name", required: true })],
      }),
    ]);
    const prompt = await client.getPrompt({ name: "greet", arguments: { name: "Ada" } });
    expect(prompt.messages).toEqual([
      { role: "user", content: { type: "text", text: "Say hi to Ada" } },
    ]);
  });
});

describe("authentication", () => {
  it("sends the API key as a bearer token on every remote request", async () => {
    remote.authHeaders.length = 0;
    const bridge = await createBridge({ url: `${remote.url}/`, apiKey: TEST_KEY });
    const client = await connectLocal(bridge, "legacy");
    await client.callTool({ name: "echo", arguments: { message: "x" } });
    await client.close();
    await bridge.close();
    expect(remote.authHeaders.length).toBeGreaterThan(2);
    expect(new Set(remote.authHeaders)).toEqual(new Set([`Bearer ${TEST_KEY}`]));
  });

  it("accepts a custom fetch", async () => {
    const seen: string[] = [];
    const bridge = await createBridge({
      url: `${remote.url}/mcp`,
      apiKey: TEST_KEY,
      fetch: (input, init) => {
        seen.push(String(input));
        return fetch(input, init);
      },
    });
    await bridge.close();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((u) => u === `${remote.url}/mcp`)).toBe(true);
  });

  it("fails with a helpful error for a rejected key", async () => {
    const err = await createBridge({ url: remote.url, apiKey: "fl_live_wrong" }).catch((e) => e);
    expect(err).toBeInstanceOf(BridgeConnectError);
    expect(err.message).toMatch(/rejected the API key/);
  });

  it("fails with a helpful error when the instance is unreachable", async () => {
    const err = await createBridge({ url: "http://127.0.0.1:1", apiKey: TEST_KEY }).catch((e) => e);
    expect(err).toBeInstanceOf(BridgeConnectError);
    expect(err.message).toMatch(/Could not connect/);
  });
});

describe("remote outage after startup", () => {
  let other: FakeRemote;
  let bridge: Bridge | undefined;
  afterEach(async () => {
    await bridge?.close();
  });

  it("answers with errors instead of crashing", async () => {
    other = await startFakeRemote();
    bridge = await createBridge({ url: other.url, apiKey: TEST_KEY });
    const client = await connectLocal(bridge, "legacy");
    await other.close();

    const call = await client.callTool({ name: "echo", arguments: { message: "x" } });
    expect(call.isError).toBe(true);
    expect(JSON.stringify(call.content)).toMatch(/Featherlog/);
    await expect(client.listPrompts()).rejects.toThrow(/Featherlog remote error/);
    await client.close();
  });
});

import { describe, expect, it } from "vitest";
import { parseCliArgs, toMcpEndpoint } from "../src/args";

describe("parseCliArgs", () => {
  it("reads --url and --key", () => {
    expect(parseCliArgs(["--url", "https://cl.example.com", "--key", "fl_live_abc"])).toEqual({
      kind: "run",
      url: "https://cl.example.com",
      apiKey: "fl_live_abc",
      warnings: [],
    });
  });

  it("supports --flag=value", () => {
    const cmd = parseCliArgs(["--url=https://cl.example.com", "--key=fl_live_abc"]);
    expect(cmd).toMatchObject({
      kind: "run",
      url: "https://cl.example.com",
      apiKey: "fl_live_abc",
    });
  });

  it("falls back to env vars, flags win", () => {
    const env = { FEATHERLOG_URL: "https://env.example.com", FEATHERLOG_API_KEY: "fl_live_env" };
    expect(parseCliArgs([], env)).toMatchObject({
      kind: "run",
      url: "https://env.example.com",
      apiKey: "fl_live_env",
    });
    expect(parseCliArgs(["--key", "fl_live_flag"], env)).toMatchObject({ apiKey: "fl_live_flag" });
  });

  it("handles --help and --version (and short forms)", () => {
    expect(parseCliArgs(["--help"])).toEqual({ kind: "help" });
    expect(parseCliArgs(["-h"])).toEqual({ kind: "help" });
    expect(parseCliArgs(["--version"])).toEqual({ kind: "version" });
    expect(parseCliArgs(["-v"])).toEqual({ kind: "version" });
  });

  it("reports missing url / key", () => {
    expect(parseCliArgs(["--key", "fl_live_x"])).toMatchObject({
      kind: "error",
      message: expect.stringMatching(/--url.*FEATHERLOG_URL/),
    });
    expect(parseCliArgs(["--url", "https://x.dev"])).toMatchObject({
      kind: "error",
      message: expect.stringMatching(/--key.*FEATHERLOG_API_KEY/),
    });
  });

  it("rejects invalid urls and unknown flags", () => {
    expect(parseCliArgs(["--url", "not a url", "--key", "fl_live_x"])).toMatchObject({
      kind: "error",
      message: expect.stringContaining("Invalid --url"),
    });
    expect(parseCliArgs(["--url", "ftp://x.dev", "--key", "fl_live_x"])).toMatchObject({
      kind: "error",
    });
    expect(parseCliArgs(["--nope"])).toMatchObject({ kind: "error" });
    expect(parseCliArgs(["positional"])).toMatchObject({ kind: "error" });
  });

  it("warns on keys that don't look like Featherlog keys", () => {
    const cmd = parseCliArgs(["--url", "https://x.dev", "--key", "abc"]);
    expect(cmd).toMatchObject({ kind: "run", warnings: [expect.stringContaining("fl_live_")] });
  });
});

describe("toMcpEndpoint", () => {
  it.each([
    ["https://cl.example.com", "https://cl.example.com/mcp"],
    ["https://cl.example.com/", "https://cl.example.com/mcp"],
    ["https://cl.example.com/mcp", "https://cl.example.com/mcp"],
    ["https://cl.example.com/mcp/", "https://cl.example.com/mcp"],
    ["https://example.com/changelog", "https://example.com/changelog/mcp"],
    ["http://localhost:3100?x=1#y", "http://localhost:3100/mcp"],
  ])("%s → %s", (input, expected) => {
    expect(toMcpEndpoint(input).href).toBe(expected);
  });
});

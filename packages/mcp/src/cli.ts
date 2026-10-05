#!/usr/bin/env node
// stdout is the MCP protocol channel: everything human-readable goes to stderr.
import { parseCliArgs, USAGE } from "./args";
import { type Bridge, BridgeConnectError, createBridge, VERSION } from "./bridge";

const log = (msg: string) => process.stderr.write(`[featherlog-mcp] ${msg}\n`);

async function main() {
  const cmd = parseCliArgs(process.argv.slice(2), process.env);
  switch (cmd.kind) {
    case "help":
      process.stderr.write(`${USAGE}\n`);
      return;
    case "version":
      // Printing the version is not a protocol session, so stdout is fine here.
      process.stdout.write(`${VERSION}\n`);
      return;
    case "error":
      process.stderr.write(`featherlog-mcp: ${cmd.message}\n\nRun with --help for usage.\n`);
      process.exitCode = 2;
      return;
  }
  for (const w of cmd.warnings) log(`warning: ${w}`);

  let bridge: Bridge;
  try {
    bridge = await createBridge({
      url: cmd.url,
      apiKey: cmd.apiKey,
      onerror: (err) => {
        if (process.env.FEATHERLOG_DEBUG) log(`error: ${err.stack ?? err.message}`);
      },
    });
  } catch (err) {
    log(err instanceof BridgeConnectError ? err.message : `Startup failed: ${String(err)}`);
    process.exitCode = 1;
    return;
  }

  let shuttingDown = false;
  const shutdown = async (code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    await bridge.close();
    process.exit(code);
  };
  process.stdin.once("end", () => void shutdown());
  process.stdin.once("close", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());

  bridge.serve();
  log(
    `bridging ${bridge.serverInfo.name} ${bridge.serverInfo.version} (${bridge.tools.length} tools) over stdio`,
  );
}

main().catch((err) => {
  log(`fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  process.exit(1);
});

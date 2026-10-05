import { chmodSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, "dist");
rmSync(out, { recursive: true, force: true });

const shared = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // Runtime deps are listed in package.json, so npx installs them; keep the bundle lean.
  packages: "external",
  legalComments: "none",
  logLevel: "warning",
};

await Promise.all([
  build({
    ...shared,
    entryPoints: [join(root, "src/cli.ts")],
    outfile: join(out, "cli.js"),
    // src/cli.ts starts with a shebang, which esbuild preserves.
  }),
  build({
    ...shared,
    entryPoints: [join(root, "src/index.ts")],
    outfile: join(out, "index.js"),
  }),
]);
chmodSync(join(out, "cli.js"), 0o755);
console.log("✓ built dist/cli.js, dist/index.js");

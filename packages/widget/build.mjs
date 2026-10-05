import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, "build");
const KB = 1024;
const targets = [
  { entry: "src/loader.ts", file: "widget.js", budget: 6 * KB },
  { entry: "src/frame.ts", file: "frame.js", budget: 8 * KB },
  { entry: "src/frame.css", file: "frame.css", budget: 4 * KB },
];

await Promise.all(
  targets.map((t) =>
    build({
      entryPoints: [join(root, t.entry)],
      outfile: join(out, t.file),
      bundle: true,
      minify: true,
      format: t.file.endsWith(".js") ? "iife" : undefined,
      target: "es2019",
      legalComments: "none",
      logLevel: "warning",
    }),
  ),
);

let failed = false;
for (const t of targets) {
  const buf = readFileSync(join(out, t.file));
  const gz = gzipSync(buf, { level: 9 }).length;
  const over = gz > t.budget;
  failed ||= over;
  console.log(
    `${over ? "✗" : "✓"} build/${t.file.padEnd(10)} ${String(buf.length).padStart(6)} B  ${(gz / KB).toFixed(2)} KB gz (budget ${t.budget / KB} KB)`,
  );
}
if (failed) {
  console.error("Bundle size budget exceeded");
  process.exit(1);
}

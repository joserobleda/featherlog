// Copies the built widget (loader + iframe assets) into /public so Next serves them statically.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const build = fileURLToPath(new URL("../../../packages/widget/build/", import.meta.url));
const pub = fileURLToPath(new URL("../public/", import.meta.url));
if (!existsSync(`${build}widget.js`)) {
  console.warn("[copy-widget] packages/widget/build not found — run `pnpm --filter @featherlog/widget build`");
  process.exit(0);
}
mkdirSync(`${pub}widget`, { recursive: true });
cpSync(`${build}widget.js`, `${pub}widget.js`);
for (const f of ["frame.js", "frame.css"]) cpSync(`${build}${f}`, `${pub}widget/${f}`);
console.log("[copy-widget] widget assets copied to public/");

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const pkg = join(dirname(fileURLToPath(import.meta.url)), "..");
const gz = (f: string) => gzipSync(readFileSync(join(pkg, "build", f)), { level: 9 }).length;

describe("build", () => {
  it("builds within the gzip budgets", { timeout: 30_000 }, () => {
    // build.mjs exits non-zero when a budget is exceeded
    execFileSync(process.execPath, [join(pkg, "build.mjs")], { cwd: pkg, stdio: "pipe" });
    expect(gz("widget.js")).toBeLessThanOrEqual(6 * 1024);
    expect(gz("frame.js")).toBeLessThanOrEqual(8 * 1024);
    const css = readFileSync(join(pkg, "build", "frame.css"), "utf8");
    expect(css).toContain(".fl-content");
    const loader = readFileSync(join(pkg, "build", "widget.js"), "utf8");
    expect(loader).toMatch(/^("use strict";)?\(\(\)=>\{/); // IIFE
  });
});

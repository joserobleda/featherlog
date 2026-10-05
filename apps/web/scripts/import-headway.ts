// Imports a Headway changelog (one public account per language) into a Featherlog workspace.
//
//   featherlog import-headway --workspace acme \
//     --source acme-changelog:en --source acme-es-updates:es [--dry-run] \
//     [--pair <id>:<id> …] [--unpair <id> …]
//
// The first --source is the primary language. Re-running is safe: imported entries are skipped.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createDb } from "@featherlog/db";
import { env } from "@/lib/env";
import { importHeadway } from "@/server/import/run";

const { values } = parseArgs({
  options: {
    workspace: { type: "string" },
    source: { type: "string", multiple: true },
    "dry-run": { type: "boolean", default: false },
    pair: { type: "string", multiple: true },
    unpair: { type: "string", multiple: true },
    // JSON file (or "-" for stdin): [{ "externalId": "123", "locale": "es", "title": "…", "contentMd": "…" }]
    "extra-translations": { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

const usage = `Usage: featherlog import-headway --workspace <slug> --source <account>:<locale> [--source …] [--dry-run] [--pair <id>:<id>] [--unpair <id>]`;
if (values.help || !values.workspace || !values.source?.length) {
  console.error(usage);
  process.exit(values.help ? 0 : 2);
}

const sources = values.source.map((s) => {
  const [account, locale] = s.split(":");
  if (!account || !locale) {
    console.error(`Invalid --source "${s}" (expected <account>:<locale>)`);
    process.exit(2);
  }
  return { account, locale };
});
const pairs = (values.pair ?? []).map((p) => p.split(":") as [string, string]);
const extraFile = values["extra-translations"];
const extraTranslations = extraFile
  ? JSON.parse(extraFile === "-" ? readFileSync(0, "utf8") : readFileSync(extraFile, "utf8"))
  : [];

const { db, close } = createDb(env.DATABASE_URL, { max: 2 });
try {
  const result = await importHeadway({
    db,
    workspace: values.workspace,
    sources,
    dryRun: values["dry-run"],
    overrides: { pairs, unpair: values.unpair ?? [] },
    extraTranslations,
    log: (m) => console.error(m),
  });
  console.log(result.report);
  if (!values["dry-run"]) {
    console.error(
      `\nDone: ${result.created} posts created, ${result.translationsAdded} translations added, ${result.skipped} already imported, ${result.images} images copied.`,
    );
  } else {
    console.error("\nDry run: nothing was written. Re-run without --dry-run to import.");
  }
} catch (err) {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await close();
}

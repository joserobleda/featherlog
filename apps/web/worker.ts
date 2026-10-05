// Standalone job worker: `pnpm --filter @featherlog/web worker` (WORKER_MODE=separate).
import { startWorker } from "./src/server/jobs";

await startWorker();
process.on("SIGTERM", () => process.exit(0));

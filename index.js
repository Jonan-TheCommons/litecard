import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import handler from "./handler.js";
import { streamCsvRows } from "./parseCSV.js";
import { log } from "./logger.js";
import { loadCompletedIndices, recordFailureCsv, recordProgress } from "./progress-tracker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const csvPath = path.join(__dirname, "data", "data.csv");
const progressFile = path.join(__dirname, "logs", "progress.ndjson");
const failedCsvPath = path.join(__dirname, "logs", "failed.csv");
const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 5);

const createLimiter = (limit) => {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("WORKER_CONCURRENCY must be >= 1");
  }
  let activeCount = 0;
  const queue = [];

  const next = () => {
    if (activeCount >= limit || queue.length === 0) {
      return;
    }

    const { fn, resolve, reject } = queue.shift();
    activeCount += 1;

    fn()
      .then(resolve, reject)
      .finally(() => {
        activeCount -= 1;
        next();
      });
  };

  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
};

const main = async () => {
  if (!fs.existsSync(csvPath)) {
    log(`CSV not found at ${csvPath}`);
    process.exit(1);
  }

  const completed = loadCompletedIndices(progressFile);
  if (completed.size > 0) {
    log(`Resuming: ${completed.size} rows already marked successful, will be skipped.`);
  }

  const limiter = createLimiter(WORKER_CONCURRENCY);
  const tasks = [];
  let totalRows = 0;
  let skippedRows = 0;
  let successCount = 0;
  let failureCount = 0;

  for await (const user of streamCsvRows(csvPath)) {
    const index = totalRows;
    totalRows += 1;

    if (completed.has(index)) {
      skippedRows += 1;
      continue;
    }

    const run = limiter(async () => {
      log(`\n=== ${index + 1} :: ${user.email || "(no email)"} ===`);
      try {
        await handler(
          {
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            memberId: user.memberId,
          },
          { rowIndex: index }
        );
        successCount += 1;
        recordProgress(progressFile, {
          index,
          status: "success",
          email: user.email,
          memberId: user.memberId,
        });
      } catch (err) {
        failureCount += 1;
        const errorMessage = err?.message || String(err);
        recordProgress(progressFile, {
          index,
          status: "failed",
          email: user.email,
          memberId: user.memberId,
          error: errorMessage,
        });
        recordFailureCsv(failedCsvPath, {
          index,
          email: user.email,
          memberId: user.memberId,
          error: errorMessage,
        });
        log(`Row ${index + 1} failed`, { error: errorMessage });
      }
    }).catch((err) => {
      log(`Row ${index + 1} encountered unexpected error`, err?.message || String(err));
    });

    tasks.push(run);
  }

  await Promise.all(tasks);

  log(
    `\nScript ended. total=${totalRows}, successes=${successCount}, failures=${failureCount}, skipped=${skippedRows}, concurrency=${WORKER_CONCURRENCY}`
  );
};

main().catch((e) => {
  log("Fatal:", e?.message || String(e));
  process.exit(1);
});

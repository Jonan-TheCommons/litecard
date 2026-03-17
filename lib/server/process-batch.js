import "server-only";

import { getServerConfig } from "./env.js";
import { log } from "./log.js";
import { processRecord } from "./process-record.js";

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

export const processBatch = async (records) => {
  const { workerConcurrency } = getServerConfig();
  const limiter = createLimiter(workerConcurrency);
  const results = new Array(records.length);

  log("Batch started", {
    total: records.length,
    concurrency: workerConcurrency,
  });

  await Promise.all(
    records.map((record, index) =>
      limiter(async () => {
        try {
          const output = await processRecord(record, { rowIndex: index });
          results[index] = {
            index,
            status: "success",
            input: record,
            output,
          };
        } catch (error) {
          results[index] = {
            index,
            status: "failed",
            input: record,
            error: error?.message || String(error),
          };
          log(`Record ${index + 1} failed`, {
            email: record.email,
            error: error?.message || String(error),
          });
        }
      }),
    ),
  );

  const succeeded = results.filter((result) => result.status === "success").length;
  const failed = results.length - succeeded;

  log("Batch finished", {
    total: records.length,
    succeeded,
    failed,
    concurrency: workerConcurrency,
  });

  return {
    summary: {
      total: records.length,
      succeeded,
      failed,
      concurrency: workerConcurrency,
    },
    results,
  };
};

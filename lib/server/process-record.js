import "server-only";

import { createPass } from "./litecard.js";
import { sendLitecardEmailWithRetry } from "./litecard-email.js";
import { log } from "./log.js";
import { withRetry } from "./retry.js";
import { updateContactLitecardId } from "./salesforce.js";

const logRetry = (phase, rowLabel) => (error, attempt, wait) => {
  log(`${rowLabel} ${phase} retry #${attempt}`, {
    waitMs: wait,
    error: error?.message || String(error),
  });
};

export const processRecord = async (payload, context = {}) => {
  const rowLabel = context.rowIndex != null ? `Record ${context.rowIndex + 1}` : "Record";
  const { id, ...passPayload } = payload;

  const pass = await withRetry(() => createPass(passPayload), {
    retries: 3,
    delayMs: 1000,
    backoffFactor: 2,
    onRetry: logRetry("Litecard", rowLabel),
  });

  log(`${rowLabel} pass created`, { cardId: pass.cardId, email: payload.email });

  const salesforce = await withRetry(
    () =>
      updateContactLitecardId({
        contactId: id,
        cardId: pass.cardId,
      }),
    {
      retries: 2,
      delayMs: 750,
      backoffFactor: 2,
      onRetry: logRetry("Salesforce update", rowLabel),
    },
  );

  log(`${rowLabel} Salesforce updated`, salesforce);

  const email = await sendLitecardEmailWithRetry(
    {
      email: payload.email,
      appleLink: pass.appleLink,
      googleLink: pass.googleLink,
    },
    { rowIndex: context.rowIndex },
  );

  return {
    pass,
    salesforce,
    email,
  };
};

import "server-only";

import { createPass } from "./litecard.js";
import { log } from "./log.js";
import { sendEmailWithTemplate } from "./postmark.js";
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

  const email = await withRetry(
    () =>
      sendEmailWithTemplate({
        email: payload.email,
        appleLink: pass.appleLink,
        googleLink: pass.googleLink,
      }),
    {
      retries: 3,
      delayMs: 1000,
      backoffFactor: 2,
      onRetry: logRetry("Postmark", rowLabel),
    },
  );

  log(`${rowLabel} email sent`, {
    email: payload.email,
    messageId: email?.MessageID ?? null,
  });

  return {
    pass,
    salesforce,
    email: {
      messageId: email?.MessageID ?? null,
      submittedAt: email?.SubmittedAt ?? null,
      errorCode: email?.ErrorCode ?? null,
      message: email?.Message ?? null,
    },
  };
};

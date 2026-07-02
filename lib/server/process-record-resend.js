import "server-only";

import { getPass, createPass } from "./litecard.js";
import { sendResendEmailWithRetry } from "./litecard-email.js";
import { log } from "./log.js";
import { withRetry } from "./retry.js";
import { getContactLitecardPassId, updateContactLitecardId } from "./salesforce.js";

const logRetry = (phase, rowLabel) => (error, attempt, wait) => {
  log(`${rowLabel} ${phase} retry #${attempt}`, {
    waitMs: wait,
    error: error?.message || String(error),
  });
};

export const processRecordResend = async (payload, context = {}) => {
  const rowLabel = context.rowIndex != null ? `Record ${context.rowIndex + 1}` : "Record";
  const { id, ...passPayload } = payload;

  const existingPassId = await withRetry(() => getContactLitecardPassId(id), {
    retries: 2,
    delayMs: 750,
    backoffFactor: 2,
    onRetry: logRetry("Salesforce lookup", rowLabel),
  });

  if (!existingPassId) {
    log(`${rowLabel} no existing pass, creating new`, { email: payload.email });

    const pass = await withRetry(() => createPass(passPayload), {
      retries: 3,
      delayMs: 1000,
      backoffFactor: 2,
      onRetry: logRetry("Litecard", rowLabel),
    });

    log(`${rowLabel} pass created`, { cardId: pass.cardId, email: payload.email });

    const salesforce = await withRetry(
      () => updateContactLitecardId({ contactId: id, cardId: pass.cardId }),
      {
        retries: 2,
        delayMs: 750,
        backoffFactor: 2,
        onRetry: logRetry("Salesforce update", rowLabel),
      },
    );

    log(`${rowLabel} Salesforce updated`, salesforce);

    const email = await sendResendEmailWithRetry(
      { email: payload.email, appleLink: pass.appleLink, googleLink: pass.googleLink },
      { rowIndex: context.rowIndex },
    );

    return { passCreated: true, pass, salesforce, email };
  }

  log(`${rowLabel} existing pass found, fetching links`, { passId: existingPassId, email: payload.email });

  const pass = await withRetry(() => getPass(existingPassId), {
    retries: 3,
    delayMs: 1000,
    backoffFactor: 2,
    onRetry: logRetry("Litecard get pass", rowLabel),
  });

  const email = await sendResendEmailWithRetry(
    { email: payload.email, appleLink: pass.appleLink, googleLink: pass.googleLink },
    { rowIndex: context.rowIndex },
  );

  return { passCreated: false, pass, email };
};

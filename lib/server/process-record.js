import "server-only";

import { getPass, createPass } from "./litecard.js";
import { sendLitecardEmailWithRetry } from "./litecard-email.js";
import { log } from "./log.js";
import { withRetry } from "./retry.js";
import { getContactLitecardPassId, updateContactLitecardId } from "./salesforce.js";

const logRetry = (phase, rowLabel) => (error, attempt, wait) => {
  log(`${rowLabel} ${phase} retry #${attempt}`, {
    waitMs: wait,
    error: error?.message || String(error),
  });
};

const createPassAndSendEmail = async ({ contactId, passPayload, email, rowLabel, rowIndex }) => {
  const pass = await withRetry(() => createPass(passPayload), {
    retries: 3,
    delayMs: 1000,
    backoffFactor: 2,
    onRetry: logRetry("Litecard", rowLabel),
  });

  log(`${rowLabel} pass created`, { cardId: pass.cardId, email });

  const salesforce = await withRetry(
    () => updateContactLitecardId({ contactId, cardId: pass.cardId }),
    {
      retries: 2,
      delayMs: 750,
      backoffFactor: 2,
      onRetry: logRetry("Salesforce update", rowLabel),
    },
  );

  log(`${rowLabel} Salesforce updated`, salesforce);

  const emailResult = await sendLitecardEmailWithRetry(
    { email, appleLink: pass.appleLink, googleLink: pass.googleLink },
    { rowIndex },
  );

  return { pass, salesforce, email: emailResult };
};

export const processRecord = async (payload, context = {}) => {
  const rowLabel = context.rowIndex != null ? `Record ${context.rowIndex + 1}` : "Record";
  const { id, ...passPayload } = payload;

  const existingPassId = await withRetry(() => getContactLitecardPassId(id), {
    retries: 2,
    delayMs: 750,
    backoffFactor: 2,
    onRetry: logRetry("Salesforce lookup", rowLabel),
  });

  if (existingPassId) {
    log(`${rowLabel} existing pass found, fetching`, { passId: existingPassId, email: payload.email });

    const pass = await withRetry(() => getPass(existingPassId), {
      retries: 3,
      delayMs: 1000,
      backoffFactor: 2,
      onRetry: logRetry("Litecard get pass", rowLabel),
    });

    if (pass.status === "ACTIVE") {
      const email = await sendLitecardEmailWithRetry(
        { email: payload.email, appleLink: pass.appleLink, googleLink: pass.googleLink },
        { rowIndex: context.rowIndex },
      );

      return { passCreated: false, pass, email };
    }

    log(`${rowLabel} existing pass is ${pass.status}, recreating`, {
      stalePassId: existingPassId,
      email: payload.email,
    });
  } else {
    log(`${rowLabel} no existing pass, creating new`, { email: payload.email });
  }

  const result = await createPassAndSendEmail({
    contactId: id,
    passPayload,
    email: payload.email,
    rowLabel,
    rowIndex: context.rowIndex,
  });

  return { passCreated: true, replacedStalePassId: existingPassId || null, ...result };
};

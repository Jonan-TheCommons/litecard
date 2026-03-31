import "server-only";

import { log } from "./log.js";
import { sendEmailWithTemplate } from "./postmark.js";
import { withRetry } from "./retry.js";

const getLabel = (context = {}) => {
  if (context.label) {
    return context.label;
  }

  if (context.rowIndex != null) {
    return `Record ${context.rowIndex + 1}`;
  }

  return "Request";
};

const logRetry = (label) => (error, attempt, wait) => {
  log(`${label} Postmark retry #${attempt}`, {
    waitMs: wait,
    error: error?.message || String(error),
  });
};

export const sendLitecardEmailWithRetry = async (payload, context = {}) => {
  const label = getLabel(context);
  const recipient = payload.email || payload.to || null;
  const response = await withRetry(() => sendEmailWithTemplate(payload), {
    retries: 3,
    delayMs: 1000,
    backoffFactor: 2,
    onRetry: logRetry(label),
  });

  log(`${label} email sent`, {
    email: recipient,
    messageId: response?.MessageID ?? null,
  });

  return {
    messageId: response?.MessageID ?? null,
    submittedAt: response?.SubmittedAt ?? null,
    errorCode: response?.ErrorCode ?? null,
    message: response?.Message ?? null,
  };
};

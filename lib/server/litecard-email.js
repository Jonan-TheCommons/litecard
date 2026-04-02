import "server-only";

import { getServerConfig } from "./env.js";
import { log } from "./log.js";
import { sendEmailWithTemplate } from "./postmark.js";
import { withRetry } from "./retry.js";

const DEFAULT_WELCOME_TEMPLATE_MODEL = Object.freeze({
  setpasswordlink: "https://members.thecommons.com.au",
  appstorelink: "https://apps.apple.com/us/app/the-commons/id1244368963",
  playstorelink: "https://play.google.com/store/apps/details?id=anterior.com.thecommon",
});

const createLoyaltyTemplateModel = ({ appleLink, googleLink, downloadId } = {}) => ({
  litecard_apple_url: appleLink,
  litecard_google_url: googleLink,
  ...(downloadId ? { litecard_download_url: downloadId } : {}),
});

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

export const sendSalesforceLitecardEmailsWithRetry = async ({ email, pass } = {}, context = {}) => {
  const { postmarkLoyaltyTemplateId, postmarkWelcomeTemplateId } = getServerConfig();
  const baseLabel = getLabel(context);

  const welcome = await sendLitecardEmailWithRetry(
    {
      email,
      templateId: postmarkWelcomeTemplateId,
      templateModel: DEFAULT_WELCOME_TEMPLATE_MODEL,
    },
    { ...context, label: `${baseLabel} welcome email` },
  );

  const loyalty = await sendLitecardEmailWithRetry(
    {
      email,
      templateId: postmarkLoyaltyTemplateId,
      templateModel: createLoyaltyTemplateModel(pass),
    },
    { ...context, label: `${baseLabel} loyalty email` },
  );

  return {
    welcome,
    loyalty,
  };
};

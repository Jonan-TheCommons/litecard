import "server-only";

import { getServerConfig } from "./env.js";

const resolveTemplateId = (templateId, fallbackTemplateId) => {
  const rawTemplateId = String(templateId ?? fallbackTemplateId ?? "").trim();

  if (!/^\d+$/.test(rawTemplateId)) {
    throw new Error("Postmark template ID must be a positive integer.");
  }

  const resolvedTemplateId = Number(rawTemplateId);

  if (!Number.isSafeInteger(resolvedTemplateId) || resolvedTemplateId < 1) {
    throw new Error("Postmark template ID must be a positive integer.");
  }

  return resolvedTemplateId;
};

const buildTemplateModel = ({ appleLink, googleLink, downloadId }) => ({
  litecard_apple_url: appleLink,
  litecard_google_url: googleLink,
  ...(downloadId ? { litecard_download_url: downloadId } : {}),
});

export const sendEmailWithTemplate = async ({
  email,
  to,
  from = "no-reply@thecommons.com.au",
  templateId,
  templateModel,
  appleLink,
  googleLink,
  downloadId,
}) => {
  const { postmarkApiToken, postmarkLoyaltyTemplateId } = getServerConfig();
  const recipient = to || email;

  if (!recipient) {
    throw new Error("Postmark recipient email is required.");
  }

  const resolvedTemplateId = resolveTemplateId(templateId, postmarkLoyaltyTemplateId);
  const resolvedTemplateModel = templateModel ?? buildTemplateModel({ appleLink, googleLink, downloadId });

  const response = await fetch("https://api.postmarkapp.com/email/withTemplate", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": postmarkApiToken,
    },
    body: JSON.stringify({
      To: recipient,
      From: from,
      TemplateId: resolvedTemplateId,
      TemplateModel: resolvedTemplateModel,
    }),
  });

  const responseData = await response.json().catch(() => null);

  if (!response.ok) {
    const postmarkMessage = responseData?.Message ? `: ${responseData.Message}` : "";
    throw new Error(`Failed to send Postmark email: ${response.status} ${response.statusText}${postmarkMessage}`);
  }

  return responseData ?? {};
};

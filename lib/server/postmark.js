import "server-only";

import { getServerConfig } from "./env.js";

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
  const { postmarkApiToken, postmarkTemplateId } = getServerConfig();
  const resolvedTemplateModel =
    templateModel ??
    {
      litecard_apple_url: appleLink,
      litecard_google_url: googleLink,
      ...(downloadId ? { litecard_download_url: downloadId } : {}),
    };

  const response = await fetch("https://api.postmarkapp.com/email/withTemplate", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": postmarkApiToken,
    },
    body: JSON.stringify({
      To: to || email,
      From: from,
      TemplateId: Number(templateId ?? postmarkTemplateId) || 0,
      TemplateModel: resolvedTemplateModel,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send Postmark email: ${response.status} ${response.statusText}`);
  }

  return response.json();
};

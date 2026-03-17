import "server-only";

import { getServerConfig } from "./env.js";

export const sendEmailWithTemplate = async ({ email, appleLink, googleLink }) => {
  const { postmarkApiToken, postmarkTemplateId } = getServerConfig();

  const response = await fetch("https://api.postmarkapp.com/email/withTemplate", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": postmarkApiToken,
    },
    body: JSON.stringify({
      To: email,
      From: "no-reply@thecommons.com.au",
      TemplateId: Number(postmarkTemplateId) || 0,
      TemplateModel: {
        litecard_apple_url: appleLink,
        litecard_google_url: googleLink,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send Postmark email: ${response.status} ${response.statusText}`);
  }

  return response.json();
};

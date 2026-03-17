import "server-only";

import { getServerConfig } from "./env.js";

let cachedToken = null;
let tokenExpiry = 0;

const EXPIRY_LEEWAY_MS = 30_000;
const DEFAULT_TTL_MS = 60 * 60 * 1000;

export const generateAccessToken = async () => {
  const { litecardBaseUrl, litecardUsername, litecardPassword } = getServerConfig();
  const now = Date.now();

  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }

  const response = await fetch(`${litecardBaseUrl}/token`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: litecardUsername,
      password: litecardPassword,
    }),
  });

  if (!response.ok) {
    throw new Error(`Litecard token request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const ttlMs = data.expires_in ? data.expires_in * 1000 : DEFAULT_TTL_MS;

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + ttlMs - EXPIRY_LEEWAY_MS;

  return cachedToken;
};

export const createPass = async (payload) => {
  const { litecardBaseUrl, litecardTemplateId } = getServerConfig();
  const token = await generateAccessToken();

  const response = await fetch(`${litecardBaseUrl}/card`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      templateId: litecardTemplateId,
      cardPayload: payload,
      options: {
        downloadId: null,
        emailInvitationEnabled: false,
        smsInvitationEnabled: false,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Litecard create pass failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  return {
    cardId: data.cardId,
    cardOwnerId: data.cardOwnerId,
    downloadId: data.downloadId,
    appleLink: data.appleLink,
    googleLink: data.googleLink,
  };
};

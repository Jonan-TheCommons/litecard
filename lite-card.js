import fetch, { Headers } from "node-fetch";
import { LITECARD_BASE_URL, LITECARD_USERNAME, LITECARD_PASSWORD, LITECARD_TEMPLATE_ID } from "./constants.js";

let cachedToken = null;
let tokenExpiry = 0; // ms epoch

// refresh 30s before real expiry
const EXPIRY_LEEWAY_MS = 30_000;
// fallback TTL (if API doesn't return expires_in)
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1h

export const generateAccessToken = async () => {
  const now = Date.now();

  // reuse token if still valid
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }

  const headers = new Headers();

  headers.append("accept", "application/json");
  headers.append("Content-Type", "application/json");

  const body = JSON.stringify({
    username: LITECARD_USERNAME,
    password: LITECARD_PASSWORD,
  });

  const options = {
    method: "POST",
    headers,
    body,
  };

  const res = await fetch(`${LITECARD_BASE_URL}/token`, options);

  if (!res.ok) {
    throw new Error(`token fetch failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const ttlMs = data.expires_in ? data.expires_in * 1000 : DEFAULT_TTL_MS;

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + ttlMs - EXPIRY_LEEWAY_MS;

  return cachedToken;
};

export const createPass = async (payload) => {
  const token = await generateAccessToken();

  const headers = new Headers();

  headers.append("accept", "application/json");
  headers.append("Content-Type", "application/json");
  headers.append("Authorization", `Bearer ${token}`);

  const body = JSON.stringify({
    templateId: LITECARD_TEMPLATE_ID,
    cardPayload: { ...payload },
    options: {
      downloadId: null,
      emailInvitationEnabled: false,
      smsInvitationEnabled: false,
    },
  });

  const options = {
    method: "POST",
    headers,
    body,
  };

  const res = await fetch(`${LITECARD_BASE_URL}/card`, options);

  if (!res.ok) {
    throw new Error(`create pass failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data
    ? {
        card_id: data.cardId,
        card_owner_id: data.cardOwnerId,
        download_id: data.downloadId,
        apple_link: data.appleLink,
        google_link: data.googleLink,
      }
    : null;
};

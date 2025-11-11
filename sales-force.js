import jsforce from "jsforce";
import jwt from "jsonwebtoken";
import fetch from "node-fetch";
import { SF_USER_NAME, SF_CONSUMER_KEY, SF_JWT_SECRET_KEY, SF_BASE_URL } from "./constants.js";
import { log } from "./logger.js";

const { sign } = jwt;
const SALESFORCE_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

let cachedConnection = null;
let cacheExpiresAt = 0;
let inflightPromise = null;

const authenticate = async () => {
  const secretKey = SF_JWT_SECRET_KEY.replace(/\\n/g, "\n");
  const exp = Math.floor(Date.now() / 1000) + 300;
  const claimSet = {
    iss: SF_CONSUMER_KEY,
    sub: SF_USER_NAME,
    aud: SF_BASE_URL,
    exp,
  };

  const assertion = sign(claimSet, secretKey, { algorithm: "RS256" });

  const requestBody = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const url = `${SF_BASE_URL}/services/oauth2/token`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: requestBody.toString(),
  });

  if (!response.ok) {
    throw new Error((await response.text()) || "Failed to authenticate with Salesforce");
  }

  const data = await response.json();
  const accessToken = data?.access_token;
  const instanceUrl = data?.instance_url;

  if (!accessToken || !instanceUrl) {
    throw new Error("Salesforce auth response missing access token or instance URL");
  }

  const conn = new jsforce.Connection({ instanceUrl, accessToken });
  cacheExpiresAt = Date.now() + SALESFORCE_TOKEN_TTL_MS;
  cachedConnection = conn;
  log("Salesforce connection refreshed");
  return conn;
};

const sf = async () => {
  const now = Date.now();
  if (cachedConnection && now < cacheExpiresAt) {
    return cachedConnection;
  }

  if (!inflightPromise) {
    inflightPromise = authenticate().finally(() => {
      inflightPromise = null;
    });
  }

  try {
    return await inflightPromise;
  } catch (error) {
    cachedConnection = null;
    cacheExpiresAt = 0;
    throw error;
  }
};

export default sf;

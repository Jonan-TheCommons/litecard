import "server-only";

import jsforce from "jsforce";
import jwt from "jsonwebtoken";
import { getServerConfig } from "./env.js";
import { log } from "./log.js";

const SALESFORCE_TOKEN_TTL_MS = 10 * 60 * 1000;

let cachedConnection = null;
let cacheExpiresAt = 0;
let inflightPromise = null;

const authenticate = async () => {
  const { salesforceConsumerKey, salesforceUserName, salesforceBaseUrl, salesforceJwtSecretKey } = getServerConfig();
  const secretKey = salesforceJwtSecretKey.replace(/\\n/g, "\n");
  const exp = Math.floor(Date.now() / 1000) + 300;
  const claimSet = {
    iss: salesforceConsumerKey,
    sub: salesforceUserName,
    aud: salesforceBaseUrl,
    exp,
  };

  const assertion = jwt.sign(claimSet, secretKey, { algorithm: "RS256" });
  const requestBody = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const response = await fetch(`${salesforceBaseUrl}/services/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
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

  cachedConnection = new jsforce.Connection({ instanceUrl, accessToken });
  cacheExpiresAt = Date.now() + SALESFORCE_TOKEN_TTL_MS;
  log("Salesforce connection refreshed");

  return cachedConnection;
};

export const getSalesforceConnection = async () => {
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

export const updateContactLitecardId = async ({ contactId, cardId }) => {
  const connection = await getSalesforceConnection();
  const result = await connection.sobject("Contact").update({
    Id: contactId,
    Litecard_Pass_ID__c: cardId,
  });

  if (!result.success) {
    throw new Error("Failed to update Salesforce record");
  }

  return result;
};

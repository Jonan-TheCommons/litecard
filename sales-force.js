import jsforce from "jsforce";
import { sign } from "jsonwebtoken";
import fetch from "node-fetch";
import { SF_USER_NAME, SF_CONSUMER_KEY, SF_JWT_SECRET_KEY, SF_BASE_URL } from "./contants.js";

const sf = async () => {
  const secretKey = SF_JWT_SECRET_KEY.replace(/\\n/g, "\n");
  const exp = Math.floor(Date.now() / 1000) + 300;
  const claimSet = {
    iss: SF_CONSUMER_KEY,
    sub: SF_USER_NAME,
    aud: SF_BASE_URL,
    exp,
  };

  const assertion = sign(claimSet, secretKey, { algorithm: "RS256" });

  try {
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

    const conn = new jsforce.Connection({ instanceUrl, accessToken });
    return conn;
  } catch (error) {
    console.log({
      id: "salesForceConn-error",
      error: String(error),
      time: new Date().toISOString(),
    });
    throw new Error(error.message || String(error));
  }
};

export default sf;

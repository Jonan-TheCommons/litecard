#!/usr/bin/env node
// Usage:
//   node scripts/probe-deleted-pass.mjs --pass <passId>
//   node scripts/probe-deleted-pass.mjs --contact <salesforceContactId>
//
// Requires .env.local with LITECARD_USERNAME, LITECARD_PASSWORD
// For --contact also requires SF_CONSUMER_KEY, SF_USER_NAME, SF_JWT_SECRET_KEY

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env.local");

try {
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
} catch {
  console.error(`[warn] could not read ${envPath} — relying on process env`);
}

const args = process.argv.slice(2);
let passId = null;
let contactId = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--pass") passId = args[++i];
  else if (args[i] === "--contact") contactId = args[++i];
}
if (!passId && !contactId) {
  console.error("usage: node scripts/probe-deleted-pass.mjs --pass <passId> | --contact <salesforceContactId>");
  process.exit(1);
}

const litecardBaseUrl = process.env.LITECARD_BASE_URL || "https://bff-api.enterprise.litecard.io/api/v1";
const { LITECARD_USERNAME, LITECARD_PASSWORD } = process.env;
if (!LITECARD_USERNAME || !LITECARD_PASSWORD) {
  console.error("missing LITECARD_USERNAME / LITECARD_PASSWORD in .env.local");
  process.exit(1);
}

if (contactId) {
  const { SF_CONSUMER_KEY, SF_USER_NAME, SF_JWT_SECRET_KEY } = process.env;
  const sfBaseUrl = process.env.SF_BASE_URL || "https://login.salesforce.com";
  if (!SF_CONSUMER_KEY || !SF_USER_NAME || !SF_JWT_SECRET_KEY) {
    console.error("missing SF_CONSUMER_KEY / SF_USER_NAME / SF_JWT_SECRET_KEY for --contact mode");
    process.exit(1);
  }

  const jsforce = (await import("jsforce")).default;
  const jwt = (await import("jsonwebtoken")).default;

  const secretKey = SF_JWT_SECRET_KEY.replace(/\\n/g, "\n");
  const assertion = jwt.sign(
    { iss: SF_CONSUMER_KEY, sub: SF_USER_NAME, aud: sfBaseUrl, exp: Math.floor(Date.now() / 1000) + 300 },
    secretKey,
    { algorithm: "RS256" },
  );
  const sfRes = await fetch(`${sfBaseUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
  });
  if (!sfRes.ok) {
    console.error(`salesforce auth failed: ${sfRes.status}`);
    console.error(await sfRes.text());
    process.exit(1);
  }
  const { access_token: accessToken, instance_url: instanceUrl } = await sfRes.json();
  const connection = new jsforce.Connection({ instanceUrl, accessToken });

  console.log(`---- Salesforce contact ${contactId} ----`);
  const contact = await connection.sobject("Contact").retrieve(contactId, ["Id", "Email", "Litecard_Pass_ID__c"]);
  console.log(JSON.stringify(contact, null, 2));
  passId = contact?.Litecard_Pass_ID__c || null;
  if (!passId) {
    console.error("\ncontact has no Litecard_Pass_ID__c — nothing to probe");
    process.exit(0);
  }
  console.log(`\nresolved pass id: ${passId}\n`);
}

const tokenRes = await fetch(`${litecardBaseUrl}/token`, {
  method: "POST",
  headers: { accept: "application/json", "content-type": "application/json" },
  body: JSON.stringify({ username: LITECARD_USERNAME, password: LITECARD_PASSWORD }),
});
if (!tokenRes.ok) {
  console.error(`token failed: ${tokenRes.status} ${tokenRes.statusText}`);
  console.error(await tokenRes.text());
  process.exit(1);
}
const { access_token: token } = await tokenRes.json();

const res = await fetch(`${litecardBaseUrl}/card/${passId}`, {
  method: "GET",
  headers: { accept: "application/json", authorization: `Bearer ${token}` },
});

console.log(`---- GET /card/${passId} ----`);
console.log(`status: ${res.status} ${res.statusText}`);
console.log("headers:");
for (const [k, v] of res.headers) console.log(`  ${k}: ${v}`);
console.log("body:");
const bodyText = await res.text();
let parsed = null;
try {
  parsed = JSON.parse(bodyText);
  console.log(JSON.stringify(parsed, null, 2));
} catch {
  console.log(bodyText);
}

if (res.ok && parsed) {
  console.log("\n---- link reachability ----");
  for (const key of ["appleLink", "googleLink"]) {
    const url = parsed[key];
    if (!url) {
      console.log(`${key}: (empty in response)`);
      continue;
    }
    try {
      const head = await fetch(url, { method: "HEAD" });
      console.log(`${key}: ${head.status} ${head.statusText}`);
      console.log(`  url: ${url}`);
    } catch (err) {
      console.log(`${key}: fetch error — ${err.message}`);
    }
  }
}

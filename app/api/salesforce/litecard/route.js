import { NextResponse } from "next/server";
import { createPass } from "../../../../lib/server/litecard.js";
import { sendLitecardEmailWithRetry } from "../../../../lib/server/litecard-email.js";
import { getServerConfig } from "../../../../lib/server/env.js";
import { log } from "../../../../lib/server/log.js";
import { withRetry } from "../../../../lib/server/retry.js";
import { ValidationError } from "../../../../lib/shared/records.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_TEMPLATE_MODEL = {
  setpasswordlink: "https://members.thecommons.com.au",
  appstorelink: "https://apps.apple.com/us/app/the-commons/id1244368963",
  playstorelink: "https://play.google.com/store/apps/details?id=anterior.com.thecommon",
};

class UnauthorizedError extends Error {
  constructor(message = "Unauthorized request.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

const formatJSONResponse = ({ response, statusCode }) =>
  NextResponse.json(
    {
      response,
      statusCode,
    },
    { status: statusCode },
  );

const ensureJsonRequest = (request) => {
  const contentType = request.headers.get("content-type")?.toLowerCase() || "";

  if (!contentType.includes("application/json")) {
    throw new ValidationError("Content-Type must be application/json.");
  }
};

const ensureAuthorizedRequest = (request) => {
  const { salesforceWebhookSecret } = getServerConfig();

  if (!salesforceWebhookSecret) {
    throw new Error("Missing required environment variable: SF_WEBHOOK_SECRET");
  }

  const authorization = request.headers.get("authorization") || "";
  const bearerToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const apiKey = request.headers.get("x-api-key")?.trim() || "";
  const presentedSecret = bearerToken || apiKey;

  if (!presentedSecret || presentedSecret !== salesforceWebhookSecret) {
    throw new UnauthorizedError();
  }
};

const parseJsonBody = async (request) => {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }
};

const normalizeRequestPayload = (body = {}) => ({
  firstName: String(body.first_name ?? "").trim(),
  lastName: String(body.last_name ?? "").trim(),
  email: String(body.email ?? "").trim(),
  memberId: String(body.member_id ?? "").trim(),
});

const validateRequestPayload = (body) => {
  const payload = normalizeRequestPayload(body);
  const requiredFields = [
    ["firstName", "first_name"],
    ["lastName", "last_name"],
    ["email", "email"],
    ["memberId", "member_id"],
  ];
  const missingFields = requiredFields
    .filter(([key]) => payload[key] === "")
    .map(([, field]) => field);

  if (missingFields.length > 0) {
    throw new ValidationError(`Missing required fields: ${missingFields.join(", ")}`);
  }

  if (!EMAIL_PATTERN.test(payload.email)) {
    throw new ValidationError("email must be a valid email address.");
  }

  return payload;
};

const logRetry = (phase, label) => (error, attempt, wait) => {
  log(`${label} ${phase} retry #${attempt}`, {
    waitMs: wait,
    error: error?.message || String(error),
  });
};

export async function POST(request) {
  let passId = null;

  try {
    ensureAuthorizedRequest(request);
    ensureJsonRequest(request);

    const body = await parseJsonBody(request);
    const payload = validateRequestPayload(body);
    const label = "Salesforce Litecard request";

    const pass = await withRetry(() => createPass(payload), {
      retries: 3,
      delayMs: 1000,
      backoffFactor: 2,
      onRetry: logRetry("Litecard", label),
    });

    passId = pass.cardId;

    log(`${label} pass created`, {
      cardId: pass.cardId,
      email: payload.email,
    });

    await sendLitecardEmailWithRetry(
      {
        email: payload.email,
        templateModel: {
          ...DEFAULT_TEMPLATE_MODEL,
          litecard_apple_url: pass.appleLink,
          litecard_google_url: pass.googleLink,
          litecard_download_url: pass.downloadId,
        },
      },
      { label },
    );

    return formatJSONResponse({
      response: { message: "ok", passId },
      statusCode: 200,
    });
  } catch (error) {
    const statusCode =
      error instanceof UnauthorizedError ? 401 : error instanceof ValidationError ? 400 : 500;
    const message =
      error instanceof UnauthorizedError || error instanceof ValidationError
        ? error.message
        : "Salesforce Litecard request failed.";

    log("Salesforce Litecard API request failed", {
      error: error?.message || String(error),
      passId,
    });

    return formatJSONResponse({
      response: {
        message,
        passId,
      },
      statusCode,
    });
  }
}

import { NextResponse } from "next/server";
import { sanitizeBatchRecords, ValidationError } from "../../../../lib/shared/records.js";
import { getServerConfig } from "../../../../lib/server/env.js";
import { log } from "../../../../lib/server/log.js";
import { processBatch } from "../../../../lib/server/process-batch.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ensureJsonRequest = (request) => {
  const contentType = request.headers.get("content-type")?.toLowerCase() || "";

  if (!contentType.includes("application/json")) {
    throw new ValidationError("Content-Type must be application/json.");
  }
};

const ensureSameOriginRequest = (request) => {
  const origin = request.headers.get("origin");

  if (!origin) {
    return;
  }

  const requestUrl = new URL(request.url);
  const protocol = request.headers.get("x-forwarded-proto") || requestUrl.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || requestUrl.host;
  const expectedOrigin = `${protocol}://${host}`;

  if (origin !== expectedOrigin) {
    throw new ValidationError("Invalid request origin.");
  }
};

const parseJsonBody = async (request) => {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }
};

export async function POST(request) {
  try {
    ensureJsonRequest(request);
    ensureSameOriginRequest(request);

    const body = await parseJsonBody(request);
    const records = sanitizeBatchRecords(body?.records);
    const { maxBatchSize } = getServerConfig();

    if (records.length > maxBatchSize) {
      throw new ValidationError(`Batch size exceeds the configured limit of ${maxBatchSize} records.`);
    }

    const result = await processBatch(records);
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof ValidationError ? 400 : 500;
    const publicMessage = error instanceof ValidationError ? error.message : "Batch processing failed.";

    if (!(error instanceof ValidationError)) {
      log("Batch API request failed", {
        error: error?.message || String(error),
      });
    }

    return NextResponse.json(
      {
        error: publicMessage,
      },
      { status },
    );
  }
}

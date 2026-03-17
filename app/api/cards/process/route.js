import { NextResponse } from "next/server";
import { sanitizeBatchRecords, ValidationError } from "../../../../lib/shared/records.js";
import { getServerConfig } from "../../../../lib/server/env.js";
import { processBatch } from "../../../../lib/server/process-batch.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const records = sanitizeBatchRecords(body?.records);
    const { maxBatchSize } = getServerConfig();

    if (records.length > maxBatchSize) {
      throw new ValidationError(`Batch size exceeds the configured limit of ${maxBatchSize} records.`);
    }

    const result = await processBatch(records);
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof ValidationError ? 400 : 500;

    return NextResponse.json(
      {
        error: error?.message || "Unexpected server error.",
      },
      { status },
    );
  }
}

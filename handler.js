import { POSTMARK_TEMPLATE_ID } from "./constants.js";
import { log } from "./logger.js";
import { createPass } from "./lite-card.js";
import { sendEmailWithTemplate } from "./post-mark.js";
import sf from "./sales-force.js";
import { withRetry } from "./retry.js";

const logRetry = (phase, rowLabel) => (error, attempt, wait) => {
  log(`${rowLabel} ${phase} retry #${attempt}`, {
    waitMs: wait,
    error: error?.message || String(error),
  });
};

const handler = async (payload, context = {}) => {
  const rowLabel = context.rowIndex != null ? `Row ${context.rowIndex + 1}` : "Row ?";
  const requiredFields = ["id", "firstName", "lastName", "email", "memberId"];
  const missingFields = requiredFields.filter((field) => {
    const value = payload?.[field];
    return value == null || (typeof value === "string" && value.trim() === "");
  });

  if (missingFields.length > 0) {
    throw new Error(`${rowLabel} missing required payload fields: ${missingFields.join(", ")}`);
  }

  const { id, email } = payload;

  const { apple_link, google_link, card_id } = await withRetry(() => createPass({ ...payload, id: undefined }), {
    retries: 3,
    delayMs: 1000,
    backoffFactor: 2,
    onRetry: logRetry("Litecard", rowLabel),
  });

  log(`${rowLabel} pass created`, { apple_link, google_link, card_id });

  const conn = await sf();
  const result = await withRetry(
    async () => {
      const res = await conn.sobject("Contact").update({
        Id: id,
        Litecard_Pass_ID__c: card_id,
      });

      return res;
    },
    {
      retries: 2,
      delayMs: 750,
      backoffFactor: 2,
      onRetry: logRetry("Salesforce update", rowLabel),
    },
  );

  log(`${rowLabel} Salesforce updated`, result);

  if (!result.success) {
    throw new Error("Failed to update Salesforce record");
  }

  const emailResponse = await withRetry(
    () =>
      sendEmailWithTemplate({
        To: email,
        From: "no-reply@thecommons.com.au",
        TemplateId: Number(POSTMARK_TEMPLATE_ID) || 0,
        TemplateModel: {
          litecard_apple_url: apple_link,
          litecard_google_url: google_link,
        },
      }),
    {
      retries: 3,
      delayMs: 1000,
      backoffFactor: 2,
      onRetry: logRetry("Postmark", rowLabel),
    },
  );

  log(`${rowLabel} email sent`, { emailResponse });
};

export default handler;

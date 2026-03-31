import "server-only";

const DEFAULTS = {
  LITECARD_BASE_URL: "https://bff-api.enterprise.litecard.io/api/v1",
  SF_BASE_URL: "https://login.salesforce.com",
  WORKER_CONCURRENCY: "5",
  MAX_BATCH_SIZE: "50",
};

let cachedConfig = null;

const getEnv = (key) => {
  const value = process.env[key] ?? DEFAULTS[key];
  return value == null ? "" : String(value).trim();
};

const getOptionalEnv = (key) => getEnv(key);

const parsePositiveInteger = (value, fallbackKey) => {
  const parsed = Number.parseInt(value || DEFAULTS[fallbackKey], 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.parseInt(DEFAULTS[fallbackKey], 10);
};

export const getServerConfig = () => {
  if (cachedConfig) {
    return cachedConfig;
  }

  const requiredKeys = [
    "LITECARD_TEMPLATE_ID",
    "LITECARD_USERNAME",
    "LITECARD_PASSWORD",
    "SF_CONSUMER_KEY",
    "SF_USER_NAME",
    "SF_JWT_SECRET_KEY",
    "POSTMARK_API_TOKEN",
    "POSTMARK_TEMPLATE_ID",
  ];

  const missing = requiredKeys.filter((key) => getEnv(key) === "");

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  cachedConfig = {
    litecardBaseUrl: getEnv("LITECARD_BASE_URL"),
    litecardTemplateId: getEnv("LITECARD_TEMPLATE_ID"),
    litecardUsername: getEnv("LITECARD_USERNAME"),
    litecardPassword: getEnv("LITECARD_PASSWORD"),
    salesforceBaseUrl: getEnv("SF_BASE_URL"),
    salesforceConsumerKey: getEnv("SF_CONSUMER_KEY"),
    salesforceUserName: getEnv("SF_USER_NAME"),
    salesforceJwtSecretKey: getEnv("SF_JWT_SECRET_KEY"),
    salesforceWebhookSecret: getOptionalEnv("SF_WEBHOOK_SECRET"),
    postmarkApiToken: getEnv("POSTMARK_API_TOKEN"),
    postmarkTemplateId: getEnv("POSTMARK_TEMPLATE_ID"),
    workerConcurrency: parsePositiveInteger(getEnv("WORKER_CONCURRENCY"), "WORKER_CONCURRENCY"),
    maxBatchSize: parsePositiveInteger(getEnv("MAX_BATCH_SIZE"), "MAX_BATCH_SIZE"),
  };

  return cachedConfig;
};

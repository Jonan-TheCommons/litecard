if (typeof window !== "undefined" || typeof document !== "undefined") {
  throw new Error("constants.js is server-only and must not be imported from browser code.");
}

const getRequiredEnv = (key) => {
  const value = process.env[key];

  if (value == null || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

const getOptionalEnv = (key, fallback) => {
  const value = process.env[key];
  return value == null || value.trim() === "" ? fallback : value;
};

export const LITECARD_BASE_URL = getOptionalEnv("LITECARD_BASE_URL", "https://bff-api.enterprise.litecard.io/api/v1");
export const LITECARD_TEMPLATE_ID = getRequiredEnv("LITECARD_TEMPLATE_ID");
export const LITECARD_USERNAME = getRequiredEnv("LITECARD_USERNAME");
export const LITECARD_PASSWORD = getRequiredEnv("LITECARD_PASSWORD");

export const SF_BASE_URL = getOptionalEnv("SF_BASE_URL", "https://login.salesforce.com");
export const SF_CONSUMER_KEY = getRequiredEnv("SF_CONSUMER_KEY");
export const SF_USER_NAME = getRequiredEnv("SF_USER_NAME");
export const SF_JWT_SECRET_KEY = getRequiredEnv("SF_JWT_SECRET_KEY");

export const POSTMARK_API_TOKEN = getRequiredEnv("POSTMARK_API_TOKEN");
export const POSTMARK_LOYALTY_TEMPLATE_ID = getRequiredEnv("POSTMARK_LOYALTY_TEMPLATE_ID");
export const POSTMARK_WELCOME_TEMPLATE_ID = getOptionalEnv("POSTMARK_WELCOME_TEMPLATE_ID", "");
export const POSTMARK_TEMPLATE_ID = POSTMARK_LOYALTY_TEMPLATE_ID;

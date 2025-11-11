const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const withRetry = async (fn, { retries = 3, delayMs = 500, backoffFactor = 2, onRetry, label } = {}) => {
  let attempt = 0;
  let lastError;

  while (attempt <= retries) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        throw error;
      }
      const wait = delayMs * Math.max(1, backoffFactor ** attempt);
      if (typeof onRetry === "function") {
        onRetry(error, attempt + 1, wait, label);
      }
      await sleep(wait);
    }
    attempt += 1;
  }

  throw lastError;
};

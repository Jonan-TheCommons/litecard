import fs from "node:fs";
import path from "node:path";

const ensureDir = (filePath) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

export const loadCompletedIndices = (progressFile) => {
  if (!fs.existsSync(progressFile)) {
    return new Set();
  }

  const content = fs.readFileSync(progressFile, "utf-8").split("\n").filter(Boolean);
  const success = new Set();
  for (const line of content) {
    try {
      const entry = JSON.parse(line);
      if (entry.status === "success" && Number.isInteger(entry.index)) {
        success.add(entry.index);
      }
    } catch {
      // ignore malformed rows
    }
  }
  return success;
};

export const recordProgress = (progressFile, entry) => {
  ensureDir(progressFile);
  const payload = {
    ...entry,
    timestamp: new Date().toISOString(),
  };
  fs.appendFileSync(progressFile, `${JSON.stringify(payload)}\n`);
};

const ensureFailedCsv = (filePath) => {
  ensureDir(filePath);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "index,email,memberId,error\n");
  }
};

const escapeCsvValue = (value) => {
  const str = value == null ? "" : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

export const recordFailureCsv = (filePath, { index, email, memberId, error }) => {
  ensureFailedCsv(filePath);
  const row = [
    index + 1,
    escapeCsvValue(email || ""),
    escapeCsvValue(memberId || ""),
    escapeCsvValue(error || ""),
  ].join(",");
  fs.appendFileSync(filePath, `${row}\n`);
};

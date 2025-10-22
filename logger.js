import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logDir = path.join(__dirname, "logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// create a new log file per run
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const logFile = path.join(logDir, `run-${stamp}.log`);

export const log = (message, data) => {
  const line = `[${new Date().toISOString()}] ${message}${data ? " " + JSON.stringify(data) : ""}\n`;
  fs.appendFileSync(logFile, line);
  console.log(line.trim());
};

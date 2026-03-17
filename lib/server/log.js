import "server-only";

import fs from "node:fs";
import path from "node:path";

const logDir = path.join(process.cwd(), "logs");

const ensureLogDir = () => {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
};

export const log = (message, data) => {
  ensureLogDir();

  const stamp = new Date().toISOString().slice(0, 10);
  const logFile = path.join(logDir, `web-${stamp}.log`);
  const line = `[${new Date().toISOString()}] ${message}${data ? ` ${JSON.stringify(data)}` : ""}\n`;

  fs.appendFileSync(logFile, line);
  console.log(line.trim());
};

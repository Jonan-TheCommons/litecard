import fs from "node:fs";
import readline from "node:readline";
import { hasBalancedQuotes, parseCsvContent, parseCsvLine } from "./lib/shared/csv.js";

export const streamCsvRows = async function* (filePath) {
  const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let headers = null;
  let buffer = "";

  for await (const line of rl) {
    buffer = buffer ? `${buffer}\n${line}` : line;
    if (!hasBalancedQuotes(buffer)) {
      continue;
    }

    if (!headers) {
      headers = parseCsvLine(buffer).map((h) => h.trim());
      buffer = "";
      continue;
    }

    if (!buffer.trim()) {
      buffer = "";
      continue;
    }

    const cells = parseCsvLine(buffer);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] ?? "").trim();
    });
    yield row;
    buffer = "";
  }

  if (buffer.trim()) {
    throw new Error("Malformed CSV: unmatched quotes detected near EOF");
  }
};

const parseCSV = (content) => parseCsvContent(content).rows;

export default parseCSV;

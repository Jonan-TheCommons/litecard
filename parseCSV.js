import fs from "node:fs";
import readline from "node:readline";

export const parseCsvLine = (line) => {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        // peek next char for escaped quote
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
};

const hasBalancedQuotes = (content) => {
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '"') {
      if (inQuotes && content[i + 1] === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    }
  }
  return !inQuotes;
};

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

const parseCSV = (content) => {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (cells[idx] ?? "").trim();
    });
    rows.push(obj);
  }
  return rows;
};

export default parseCSV;

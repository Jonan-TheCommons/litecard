import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import handler from "./handler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const csvPath = path.join(__dirname, "data", "data.csv");

const parseCsvLine = (line) => {
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

const main = async () => {
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found at ${csvPath}`);
    process.exit(1);
  }

  const csv = fs.readFileSync(csvPath, "utf-8");
  const users = parseCSV(csv);

  // expected headers: id, firstName, lastName, email, memberId
  console.log(`Loaded ${users.length} rows from data/data.csv`);

  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    console.log(`\n=== ${i + 1}/${users.length} :: ${u.email || "(no email)"} ===`);
    try {
      await handler({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        memberId: u.memberId,
      });
    } catch (err) {
      console.error(`Row ${i + 1} failed:`, err?.message || String(err));
      // continue to next row
    }
  }

  console.log("\nAll done.");
};

main().catch((e) => {
  console.error("Fatal:", e?.message || String(e));
  process.exit(1);
});

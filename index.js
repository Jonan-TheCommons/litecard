import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import handler from "./handler.js";
import parseCSV from "./parseCSV.js";
import { log } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const csvPath = path.join(__dirname, "data", "data.csv");

const main = async () => {
  if (!fs.existsSync(csvPath)) {
    log(`CSV not found at ${csvPath}`);
    process.exit(1);
  }

  const csv = fs.readFileSync(csvPath, "utf-8");
  const users = parseCSV(csv);

  // expected headers: id, firstName, lastName, email, memberId
  log(`Loaded ${users.length} rows from data/data.csv`);

  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    log(`\n=== ${i + 1}/${users.length} :: ${u.email || "(no email)"} ===`);
    try {
      await handler({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        memberId: u.memberId,
      });
    } catch (err) {
      log(`Row ${i + 1} failed:`, err?.message || String(err));
      // continue to next row
    }
  }

  log("\nScript ended.");
};

main().catch((e) => {
  log("Fatal:", e?.message || String(e));
  process.exit(1);
});

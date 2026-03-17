const stripBom = (value) => value.replace(/^\uFEFF/, "");

export const parseCsvLine = (line) => {
  const out = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (inQuotes) {
      if (character === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += character;
      }
    } else if (character === '"') {
      inQuotes = true;
    } else if (character === ",") {
      out.push(current);
      current = "";
    } else {
      current += character;
    }
  }

  out.push(current);
  return out;
};

export const hasBalancedQuotes = (content) => {
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    if (content[index] !== '"') {
      continue;
    }

    if (inQuotes && content[index + 1] === '"') {
      index += 1;
      continue;
    }

    inQuotes = !inQuotes;
  }

  return !inQuotes;
};

const buildRowObject = (headers, cells) => {
  const row = {};

  headers.forEach((header, index) => {
    row[header] = (cells[index] ?? "").trim();
  });

  return row;
};

export const parseCsvContent = (content) => {
  const normalized = String(content ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  let headers = null;
  let buffer = "";
  const rows = [];

  for (const rawLine of lines) {
    buffer = buffer ? `${buffer}\n${rawLine}` : rawLine;

    if (!hasBalancedQuotes(buffer)) {
      continue;
    }

    if (!headers) {
      if (!buffer.trim()) {
        buffer = "";
        continue;
      }

      headers = parseCsvLine(buffer).map((header, index) =>
        index === 0 ? stripBom(header).trim() : header.trim(),
      );
      buffer = "";
      continue;
    }

    if (!buffer.trim()) {
      buffer = "";
      continue;
    }

    rows.push(buildRowObject(headers, parseCsvLine(buffer)));
    buffer = "";
  }

  if (buffer.trim()) {
    throw new Error("Malformed CSV: unmatched quotes detected near EOF");
  }

  return {
    headers: headers ?? [],
    rows,
  };
};

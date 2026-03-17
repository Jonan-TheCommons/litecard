export const REQUIRED_FIELDS = ["id", "firstName", "lastName", "email", "memberId"];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

export const createEmptyRecord = () => ({
  id: "",
  firstName: "",
  lastName: "",
  email: "",
  memberId: "",
});

export const normalizeRecord = (record = {}) => ({
  id: String(record.id ?? "").trim(),
  firstName: String(record.firstName ?? "").trim(),
  lastName: String(record.lastName ?? "").trim(),
  email: String(record.email ?? "").trim(),
  memberId: String(record.memberId ?? "").trim(),
});

export const isRecordEmpty = (record = {}) => {
  const normalized = normalizeRecord(record);
  return REQUIRED_FIELDS.every((field) => normalized[field] === "");
};

export const validateRecord = (record, index = 0) => {
  const normalized = normalizeRecord(record);
  const missingFields = REQUIRED_FIELDS.filter((field) => normalized[field] === "");

  if (missingFields.length > 0) {
    throw new ValidationError(`Record ${index + 1} is missing required fields: ${missingFields.join(", ")}`);
  }

  if (!EMAIL_PATTERN.test(normalized.email)) {
    throw new ValidationError(`Record ${index + 1} has an invalid email address.`);
  }

  return normalized;
};

export const sanitizeBatchRecords = (records) => {
  if (!Array.isArray(records)) {
    throw new ValidationError("The request payload must contain a records array.");
  }

  const normalized = records.map(normalizeRecord).filter((record) => !isRecordEmpty(record));

  if (normalized.length === 0) {
    throw new ValidationError("At least one member record is required.");
  }

  return normalized.map((record, index) => validateRecord(record, index));
};

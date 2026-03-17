import crypto from "node:crypto";

import { ValidationError } from "./errors";

export const DAILY_STATUS_VALUES = new Set(["תקין", "לא תקין", "לא הוזן"]);
export const SELF_STATUS_VALUES = new Set(["תקין", "לא תקין"]);
export const HOME_LOCATION = "בבית";

export function toIsoDate(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function nowUtcIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function parseDateOrThrow(rawValue: string) {
  const value = String(rawValue || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError("Date must be in YYYY-MM-DD format");
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError("Invalid date value");
  }
  return value;
}

export function cleanString(value: string, fallback = "") {
  const cleaned = String(value ?? "").trim();
  return cleaned || fallback;
}

export function ensureDailyStatus(value: string, { allowEmpty = false } = {}) {
  if (value == null || value === "") {
    if (allowEmpty) {
      return null;
    }
    return "לא הוזן";
  }
  const status = cleanString(value);
  if (!DAILY_STATUS_VALUES.has(status)) {
    throw new ValidationError("Invalid daily_status value");
  }
  return status;
}

export function ensureSelfDailyStatus(value: string) {
  const status = cleanString(value);
  if (!SELF_STATUS_VALUES.has(status)) {
    throw new ValidationError("Invalid self_daily_status value");
  }
  return status;
}

export function ensureNonEmpty(value: string, fieldName: string, maxLength = 500) {
  const cleaned = cleanString(value);
  if (!cleaned) {
    throw new ValidationError(`${fieldName} cannot be empty`);
  }
  if (cleaned.length > maxLength) {
    throw new ValidationError(`${fieldName} is too long`);
  }
  return cleaned;
}

export function makePersonId(fullName: string) {
  const normalized = cleanString(fullName)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  const suffix = crypto.randomUUID().slice(0, 8);
  return `${normalized || "person"}-${suffix}`;
}

export function makeEventId() {
  return crypto.randomUUID();
}

// Utility helpers for normalizing backend payloads and UI-facing errors.
const DEFAULT_SYSTEM_STATUS = {
  server_date: null,
  server_time_utc: null,
  telegram_enabled: false,
  telegram_configured: false,
  telegram_running: false,
  telegram_healthy: false,
  telegram_active: false,
  telegram_message: "בוט טלגרם לא פעיל",
  telegram_last_error: null,
};

// Normalize backend system status payload so UI stays stable if fields are missing.
export function normalizeSystemStatus(payload) {
  const parsedDate =
    typeof payload?.server_date === "string" && payload.server_date
      ? payload.server_date
      : null;
  const parsedUtcTime =
    typeof payload?.server_time_utc === "string" && payload.server_time_utc
      ? payload.server_time_utc
      : null;

  return {
    ...DEFAULT_SYSTEM_STATUS,
    ...(payload || {}),
    server_date: parsedDate,
    server_time_utc: parsedUtcTime,
    telegram_active: Boolean(payload?.telegram_active),
    telegram_message:
      payload?.telegram_message || DEFAULT_SYSTEM_STATUS.telegram_message,
  };
}

//TODO extract error logic to util file
// Convert unknown thrown value into a stable UI error message.
export function getErrorMessage(error, fallbackMessage) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  if (typeof error?.detail === "string" && error.detail.trim()) {
    return error.detail;
  }
  return fallbackMessage;
}

// Normalize snapshot payload so corrupted/missing fields will not break UI rendering.
export function normalizeSnapshotPayload(payload, fallbackDate) {
  const safeDate =
    typeof payload?.date === "string" && payload.date ? payload.date : fallbackDate;
  const rawPeople = Array.isArray(payload?.people) ? payload.people : [];

  const normalizedPeople = rawPeople
    .filter((item) => item && typeof item === "object")
    .map((person) => ({
      person_id: String(person.person_id || ""),
      full_name: String(person.full_name || ""),
      location: String(person.location || ""),
      daily_status: String(person.daily_status || ""),
      self_location: person.self_location ? String(person.self_location) : "",
      self_daily_status: person.self_daily_status
        ? String(person.self_daily_status)
        : "",
      notes: person.notes ? String(person.notes) : "",
      last_updated: person.last_updated ? String(person.last_updated) : "",
      date: typeof person.date === "string" && person.date ? person.date : safeDate,
    }));

  return {
    date: safeDate,
    people: normalizedPeople,
  };
}

export { DEFAULT_SYSTEM_STATUS };

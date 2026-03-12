// Value is injected by Vite from config/app_config.yaml (frontend.api_base_url).
const API_BASE_URL = __API_BASE_URL__ || "";
const WRITE_API_KEY = __WRITE_API_KEY__ || "";

function buildApiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

// Generic JSON request helper with centralized error handling.
async function apiRequest(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const isWriteMethod = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  const authHeader = isWriteMethod && WRITE_API_KEY ? { "X-API-Key": WRITE_API_KEY } : {};

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...authHeader,
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || "השרת החזיר שגיאה לא צפויה");
  }

  return response.json();
}

// Load today's snapshot from backend.
export function fetchTodaySnapshot() {
  return apiRequest("/api/snapshot/today");
}

// Load snapshot for a specific date.
export function fetchSnapshotByDate(snapshotDate) {
  return apiRequest(`/api/snapshot/${snapshotDate}`);
}

// Force-save selected snapshot file (explicit save action).
export function saveSnapshotNow(snapshotDate) {
  return apiRequest(`/api/snapshot/${snapshotDate}/save`, {
    method: "POST",
  });
}

// Delete selected snapshot date file (and matching tracking-events file).
export function deleteSnapshotDate(snapshotDate) {
  return apiRequest(`/api/snapshot/${snapshotDate}`, {
    method: "DELETE",
  });
}

// Download one day's snapshot file as xlsx.
export function downloadDaySnapshot(snapshotDate) {
  return {
    url: buildApiUrl(`/api/export/day/${snapshotDate}`),
    filename: `${snapshotDate}.xlsx`,
  };
}

// Download all snapshot xlsx files between date_from and date_to as zip.
export function downloadRangeSnapshots(dateFrom, dateTo) {
  const query = `date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(
    dateTo
  )}`;
  return {
    url: buildApiUrl(`/api/export/range?${query}`),
    filename: `snapshots_${dateFrom}_to_${dateTo}.zip`,
  };
}

// Load list of all available snapshot dates.
export function fetchAvailableDates() {
  return apiRequest("/api/history/dates");
}

// Load backend integration runtime status (Telegram bot, etc.).
export function fetchSystemStatus() {
  return apiRequest("/api/system/status");
}

// Load list of available locations (stored in locations Excel file).
export function fetchLocations() {
  return apiRequest("/api/locations");
}

// Add a new location option into locations Excel file.
export function createLocation(location) {
  return apiRequest("/api/locations", {
    method: "POST",
    body: JSON.stringify({ location }),
  });
}

// Delete one location option from locations Excel file.
export function deleteLocation(location) {
  return apiRequest(`/api/locations/${encodeURIComponent(location)}`, {
    method: "DELETE",
  });
}

// Apply a partial update for one person row.
export function quickUpdatePerson(personId, patch) {
  return apiRequest(`/api/people/${personId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

// Create a new person in today's snapshot and master list.
export function addPerson(payload) {
  return apiRequest("/api/people", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Bulk-create initial people names (saved to master and today's snapshot).
export function addInitialPeopleList(names) {
  return apiRequest("/api/people/initialize-list", {
    method: "POST",
    body: JSON.stringify({ names }),
  });
}

// Replace person data for today's snapshot row.
export function replacePerson(personId, payload) {
  return apiRequest(`/api/people/${personId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

// Delete person from today's snapshot and master list.
export function deletePerson(personId) {
  return apiRequest(`/api/people/${personId}`, {
    method: "DELETE",
  });
}

// Load one person's location-events timeline for selected date (today by default).
export function fetchPersonLocationEvents(
  personId,
  snapshotDate,
  options = {}
) {
  const params = new URLSearchParams();
  if (snapshotDate) {
    params.set("snapshot_date", snapshotDate);
  }
  if (typeof options.includeVoided === "boolean") {
    params.set("include_voided", options.includeVoided ? "true" : "false");
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/api/people/${personId}/location-events${query}`);
}

// Load one person's computed location transitions for selected date.
export function fetchPersonTransitions(personId, snapshotDate) {
  const query = snapshotDate
    ? `?snapshot_date=${encodeURIComponent(snapshotDate)}`
    : "";
  return apiRequest(`/api/people/${personId}/transitions${query}`);
}

// Append one location-event row for a person (today only).
export function createPersonLocationEvent(personId, payload) {
  return apiRequest(`/api/people/${personId}/location-events`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Void one location-event row for a person (today only).
export function deletePersonLocationEvent(
  personId,
  eventId,
  reason = "correction"
) {
  const query = `?reason=${encodeURIComponent(reason)}`;
  return apiRequest(`/api/people/${personId}/location-events/${eventId}${query}`, {
    method: "DELETE",
  });
}

// Restore selected historical date into today's snapshot.
export function restoreHistoryToToday(snapshotDate) {
  return apiRequest(`/api/history/${snapshotDate}/restore-to-today`, {
    method: "POST",
  });
}

// Return local-date string in YYYY-MM-DD format.
export function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

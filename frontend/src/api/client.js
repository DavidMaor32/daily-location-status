// Value is injected by Vite from config/app_config.yaml (frontend.api_base_url).
const API_BASE_URL = __API_BASE_URL__ || "";

// Extract filename from Content-Disposition header.
function extractFilename(contentDisposition, fallbackName) {
  if (!contentDisposition) {
    return fallbackName;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const basicMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (basicMatch?.[1]) {
    return basicMatch[1];
  }

  return fallbackName;
}

// Generic JSON request helper with centralized error handling.
async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
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

// Generic file download helper that returns blob + resolved filename.
async function fileRequest(path, fallbackName) {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || "הורדת קובץ נכשלה");
  }

  const blob = await response.blob();
  const filename = extractFilename(
    response.headers.get("content-disposition"),
    fallbackName
  );
  return { blob, filename };
}

// Load today's snapshot from backend.
export function fetchTodaySnapshot() {
  return apiRequest("/api/snapshot/today");
}

// Load snapshot for a specific date.
export function fetchSnapshotByDate(snapshotDate) {
  return apiRequest(`/api/snapshot/${snapshotDate}`);
}

// Download one day's snapshot file as xlsx.
export function downloadDaySnapshot(snapshotDate) {
  return fileRequest(`/api/export/day/${snapshotDate}`, `${snapshotDate}.xlsx`);
}

// Download all snapshot xlsx files between date_from and date_to as zip.
export function downloadRangeSnapshots(dateFrom, dateTo) {
  const query = `date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(
    dateTo
  )}`;
  return fileRequest(
    `/api/export/range?${query}`,
    `snapshots_${dateFrom}_to_${dateTo}.zip`
  );
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


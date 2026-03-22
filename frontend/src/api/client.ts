import axios, { type AxiosRequestConfig } from "axios";
import moment from "moment";
import { getApiErrorMessage } from "./errors";

declare const __API_BASE_URL__: string | undefined;

type JsonObject = Record<string, unknown>;
type JsonValue = JsonObject | unknown[] | string | number | boolean | null;

type RequestOptions = Omit<AxiosRequestConfig, "url" | "method" | "data"> & {
  method?: AxiosRequestConfig["method"];
  data?: AxiosRequestConfig["data"];
};

type DownloadInfo = {
  url: string;
  filename: string;
};

type PersonLocationEventOptions = {
  includeVoided?: boolean;
};

// Frontend API client: centralizes HTTP calls, endpoints, and date helpers.

// Value is injected by Vite from config/app_config.yaml (frontend.api_base_url).
const API_BASE_URL = __API_BASE_URL__ || "";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

const buildApiUrl = (path: string): string => `${API_BASE_URL}${path}`;

const apiRequest = async <T = JsonValue>(
  path: string,
  options: RequestOptions = {}
): Promise<T> => {
  try {
    const response = await apiClient.request<T>({
      url: path,
      method: options.method ?? "GET",
      ...options,
    });

    return (response.data ?? {}) as T;
  } catch (error) {
    throw new Error(getApiErrorMessage(error));
  }
};

// Load today's snapshot from backend.
export const fetchTodaySnapshot = () => apiRequest("/snapshot/today");

// Load snapshot for a specific date.
export const fetchSnapshotByDate = (snapshotDate: string) =>
  apiRequest(`/snapshot/${snapshotDate}`);

// Force-save selected snapshot file (explicit save action).
export const saveSnapshotNow = (snapshotDate: string) =>
  apiRequest(`/snapshot/${snapshotDate}/save`, {
    method: "POST",
  });

// Delete selected snapshot date file (and matching tracking-events file).
export const deleteSnapshotDate = (snapshotDate: string) =>
  apiRequest(`/snapshot/${snapshotDate}`, {
    method: "DELETE",
  });

// Download one day's snapshot file as xlsx.
export const downloadDaySnapshot = (snapshotDate: string): DownloadInfo => ({
  url: buildApiUrl(`/export/day/${snapshotDate}`),
  filename: `${snapshotDate}.xlsx`,
});

// Download all snapshot xlsx files between date_from and date_to as zip.
export const downloadRangeSnapshots = (
  dateFrom: string,
  dateTo: string
): DownloadInfo => {
  const params = new URLSearchParams({
    date_from: dateFrom,
    date_to: dateTo,
  });

  return {
    url: buildApiUrl(`/export/range?${params.toString()}`),
    filename: `snapshots_${dateFrom}_to_${dateTo}.zip`,
  };
};

// Load list of all available snapshot dates.
export const fetchAvailableDates = () => apiRequest("/history/dates");

// Load backend integration runtime status (Telegram bot, etc.).
export const fetchSystemStatus = () => apiRequest("/system/status");

// Load list of available locations (stored in locations Excel file).
export const fetchLocations = () => apiRequest("/locations");

// Add a new location option into locations Excel file.
export const createLocation = (location: string) =>
  apiRequest("/locations", {
    method: "POST",
    data: { location },
  });

// Delete one location option from locations Excel file.
export const deleteLocation = (location: string) =>
  apiRequest(`/locations/${encodeURIComponent(location)}`, {
    method: "DELETE",
  });

// Apply a partial update for one person row.
export const quickUpdatePerson = (personId: string, patch: JsonObject) =>
  apiRequest(`/people/${personId}`, {
    method: "PATCH",
    data: patch,
  });

// Create a new person in today's snapshot and master list.
export const addPerson = (payload: JsonObject) =>
  apiRequest("/people", {
    method: "POST",
    data: payload,
  });

// Bulk-create initial people names (saved to master and today's snapshot).
export const addInitialPeopleList = (names: string[]) =>
  apiRequest("/people/initialize-list", {
    method: "POST",
    data: { names },
  });

// Replace person data for today's snapshot row.
export const replacePerson = (personId: string, payload: JsonObject) =>
  apiRequest(`/people/${personId}`, {
    method: "PUT",
    data: payload,
  });

// Delete person from today's snapshot and master list.
export const deletePerson = (personId: string) =>
  apiRequest(`/people/${personId}`, {
    method: "DELETE",
  });

// Load one person's location-events timeline for selected date (today by default).
export const fetchPersonLocationEvents = (
  personId: string,
  snapshotDate?: string,
  options: PersonLocationEventOptions = {}
) => {
  const params = new URLSearchParams();

  if (snapshotDate) {
    params.set("snapshot_date", snapshotDate);
  }

  if (typeof options.includeVoided === "boolean") {
    params.set("include_voided", options.includeVoided ? "true" : "false");
  }

  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/people/${personId}/location-events${query}`);
};

// Load one person's computed location transitions for selected date.
export const fetchPersonTransitions = (
  personId: string,
  snapshotDate?: string
) => {
  const query = snapshotDate
    ? `?snapshot_date=${encodeURIComponent(snapshotDate)}`
    : "";

  return apiRequest(`/people/${personId}/transitions${query}`);
};

// Append one location-event row for a person (today only).
export const createPersonLocationEvent = (
  personId: string,
  payload: JsonObject
) =>
  apiRequest(`/people/${personId}/location-events`, {
    method: "POST",
    data: payload,
  });

// Void one location-event row for a person (today only).
export const deletePersonLocationEvent = (
  personId: string,
  eventId: string,
  reason = "correction"
) =>
  apiRequest(
    `/people/${personId}/location-events/${eventId}?reason=${encodeURIComponent(
      reason
    )}`,
    {
      method: "DELETE",
    }
  );

// Restore selected historical date into today's snapshot.
export const restoreHistoryToToday = (snapshotDate: string) =>
  apiRequest(`/history/${snapshotDate}/restore-to-today`, {
    method: "POST",
  });

// Return local-date string in YYYY-MM-DD format.
export const getTodayString = (): string => moment().format("YYYY-MM-DD");
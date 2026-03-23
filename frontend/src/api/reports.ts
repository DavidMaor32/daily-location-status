import { apiRequest, buildApiUrl, buildQueryString, type DownloadInfo } from "./base";

export type Report = {
  userId: number;
  locationId: number;
  isStatusOk?: boolean | null;
  occurredAt: string;
};

export type ReportFilters = {
  minDate?: string;
  maxDate?: string;
  date?: string;
  userId?: number;
  locationId?: number;
  status?: string;
};

export type CreateReportPayload = {
  userId: number;
  locationId: number;
  isStatusOk?: boolean;
  occurredAt: string;
  source: "ui" | "bot";
};

export const fetchReports = (filters: ReportFilters = {}) =>
  apiRequest<Report[]>(`/reports${buildQueryString(filters)}`);

export const createReport = (payload: CreateReportPayload) =>
  apiRequest("/reports", {
    method: "POST",
    data: payload,
  });

export const exportReports = (
  filters: ReportFilters = {},
  filename = "reports.xlsx"
): DownloadInfo => ({
  url: buildApiUrl(`/reports/export${buildQueryString(filters)}`),
  filename,
});

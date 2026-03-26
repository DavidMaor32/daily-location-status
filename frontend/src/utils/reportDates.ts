import type { Report } from "../api/reports";

export const normalizeLocationName = (value: unknown): string =>
  String(value ?? "").trim();

export const getReportLocalDate = (
  value: string | undefined | null
): string => {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value).slice(0, 10);
  }

  const year = String(parsed.getFullYear());
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const buildAvailableDates = (
  reports: Report[],
  todayString: string,
  selectedDate: string
): string[] => {
  const allDates = Array.isArray(reports)
    ? reports
        .map((report) => getReportLocalDate(report.occurredAt))
        .filter(Boolean)
    : [];

  return Array.from(new Set([todayString, selectedDate, ...allDates]))
    .filter(Boolean)
    .sort((left, right) => right.localeCompare(left));
};

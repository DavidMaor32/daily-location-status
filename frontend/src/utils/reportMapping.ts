import type { Report } from "../api/reports";
import {
  DAILY_STATUS_BAD,
  DAILY_STATUS_MISSING,
  DAILY_STATUS_OK,
} from "../constants/statuses";

export const getLatestReportForUser = (
  reports: Report[],
  userId: number
): Report | undefined =>
  reports
    .filter((report) => Number(report?.userId) === Number(userId))
    .sort(
      (left, right) =>
        new Date(right?.occurredAt || 0).getTime() -
        new Date(left?.occurredAt || 0).getTime()
    )[0];

export const mapReportStatusToDailyStatus = (
  isStatusOk: boolean | null | undefined
): string => {
  if (isStatusOk === true) {
    return DAILY_STATUS_OK;
  }

  if (isStatusOk === false) {
    return DAILY_STATUS_BAD;
  }

  return DAILY_STATUS_MISSING;
};

export const mapDailyStatusToReportStatus = (
  dailyStatus: string
): boolean | null => {
  if (dailyStatus === DAILY_STATUS_OK) {
    return true;
  }

  if (dailyStatus === DAILY_STATUS_BAD) {
    return false;
  }

  return null;
};

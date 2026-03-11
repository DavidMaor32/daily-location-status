// Central status values used across the frontend.
export const DAILY_STATUS_OK = "תקין";
export const DAILY_STATUS_BAD = "לא תקין";
export const DAILY_STATUS_MISSING = "לא הוזן";

// Map daily/self status value to chip color class.
export function getDailyStatusChipClass(status) {
  if (status === DAILY_STATUS_OK) {
    return "chip-status-ok";
  }
  if (status === DAILY_STATUS_BAD) {
    return "chip-status-bad";
  }
  return "chip-status-missing";
}

import moment from "moment";

// Convert backend ISO timestamp into friendly Hebrew date-time.
export const formatTimestamp = (value?: string | null): string => {
  if (!value) {
    return "-";
  }

  const parsed = moment(value);
  if (!parsed.isValid()) {
    return value;
  }

  return parsed.locale("he").format("DD/MM/YYYY, HH:mm");
};

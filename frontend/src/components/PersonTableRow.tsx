import clsx from "clsx";
import { getLocationChipClass } from "../constants/locations.ts";
import {
  DAILY_STATUS_BAD,
  DAILY_STATUS_MISSING,
  DAILY_STATUS_OK,
  getDailyStatusChipClass,
} from "../constants/statuses.ts";
import { formatTimestamp } from "../utils/dates";
import type { QuickUpdatePatch } from "./PersonTable";

// Compatibility row shape used while App.jsx adapts users + reports into the table.
export type PersonRow = {
  person_id: string;
  full_name: string;
  location: string;
  daily_status: string;
  phone?: string;
  last_updated?: string;
};

const getStatusQuickButtonClass = (
  targetStatus: string,
  currentStatus: string
): string => {
  let activeClass = "";
  if (targetStatus === DAILY_STATUS_OK) {
    activeClass = "active-status-ok";
  } else if (targetStatus === DAILY_STATUS_BAD) {
    activeClass = "active-status-bad";
  } else if (targetStatus === DAILY_STATUS_MISSING) {
    activeClass = "active-status-missing";
  }

  return clsx(
    "btn",
    "btn-chip",
    "btn-status-choice",
    targetStatus === currentStatus && activeClass
  );
};

type PersonTableRowProps = {
  person: PersonRow;
  locationOptions: string[];
  readOnly: boolean;
  onQuickUpdate: (personId: string, patch: QuickUpdatePatch) => void;
};

const PersonTableRow = ({
  person,
  locationOptions,
  readOnly,
  onQuickUpdate,
}: PersonTableRowProps) => {
  return (
    <tr>
      <td>{person.full_name}</td>
      <td>
        <span className={`status-chip ${getLocationChipClass(person.location)}`}>
          {person.location}
        </span>
        {!readOnly ? (
          <div className="quick-actions">
            {locationOptions.map((location) => (
              <button
                key={location}
                type="button"
                className="btn btn-chip"
                onClick={() => onQuickUpdate(person.person_id, { location })}
              >
                {location}
              </button>
            ))}
          </div>
        ) : null}
      </td>
      <td>
        <span
          className={`status-chip ${getDailyStatusChipClass(person.daily_status)}`}
        >
          {person.daily_status}
        </span>
        {!readOnly ? (
          <div className="quick-actions">
            <button
              type="button"
              className={getStatusQuickButtonClass(
                DAILY_STATUS_OK,
                person.daily_status
              )}
              onClick={() =>
                onQuickUpdate(person.person_id, {
                  daily_status: DAILY_STATUS_OK,
                })
              }
            >
              תקין
            </button>
            <button
              type="button"
              className={getStatusQuickButtonClass(
                DAILY_STATUS_BAD,
                person.daily_status
              )}
              onClick={() =>
                onQuickUpdate(person.person_id, {
                  daily_status: DAILY_STATUS_BAD,
                })
              }
            >
              לא תקין
            </button>
            <button
              type="button"
              //hidden for now to decide if its needed
              hidden
              className={getStatusQuickButtonClass(
                DAILY_STATUS_MISSING,
                person.daily_status
              )}
              onClick={() =>
                onQuickUpdate(person.person_id, {
                  daily_status: DAILY_STATUS_MISSING,
                })
              }
            >
              איפוס
            </button>
          </div>
        ) : null}
      </td>
      <td>{person.phone || "-"}</td>
      <td>{formatTimestamp(person.last_updated)}</td>
    </tr>
  );
};

export default PersonTableRow;

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

export type PersonRow = {
  person_id: string;
  full_name: string;
  location: string;
  daily_status: string;
  self_location?: string;
  self_daily_status?: string;
  notes?: string;
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
  telegramActive: boolean;
  onQuickUpdate: (personId: string, patch: QuickUpdatePatch) => void;
  onEdit: (person: PersonRow) => void;
  onTrack: (person: PersonRow) => void;
};

const PersonTableRow = ({
  person,
  locationOptions,
  readOnly,
  telegramActive,
  onQuickUpdate,
  onEdit,
  onTrack,
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
      <td>
        {person.self_location ? (
          <span
            className={`status-chip ${getLocationChipClass(person.self_location)}`}
          >
            {person.self_location}
          </span>
        ) : telegramActive ? (
          "-"
        ) : (
          ""
        )}
      </td>
      <td>
        {person.self_daily_status ? (
          <span
            className={`status-chip ${getDailyStatusChipClass(person.self_daily_status)}`}
          >
            {person.self_daily_status}
          </span>
        ) : telegramActive ? (
          "-"
        ) : (
          ""
        )}
      </td>
      <td>{person.notes || "-"}</td>
      <td>{formatTimestamp(person.last_updated)}</td>
      <td>
        <button
          className="btn btn-secondary"
          data-testid={`track-person-${person.person_id}`}
          onClick={() => onTrack(person)}
        >
          מעקב
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => onEdit(person)}
          disabled={readOnly}
        >
          עריכה
        </button>
      </td>
    </tr>
  );
};

export default PersonTableRow;

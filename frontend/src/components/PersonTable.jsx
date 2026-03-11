import { getLocationChipClass } from "../constants/locations";

// Convert backend ISO timestamp into friendly Hebrew date-time.
function formatTimestamp(value) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("he-IL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Render the main people table with quick actions for status/location updates.
function PersonTable({
  people,
  locationOptions,
  readOnly,
  telegramActive,
  telegramMessage,
  onQuickUpdate,
  onEdit,
}) {
  return (
    <div className="table-wrapper">
      <table className="people-table">
        <thead>
          <tr>
            <th>שם מלא</th>
            <th>מיקום נוכחי</th>
            <th>סטטוס יומי</th>
            <th>
              מיקום בהזנה עצמאית
              {!telegramActive ? (
                <div className="column-note">{telegramMessage}</div>
              ) : null}
            </th>
            <th>
              סטטוס בהזנה עצמאית
              {!telegramActive ? (
                <div className="column-note">{telegramMessage}</div>
              ) : null}
            </th>
            <th>הערות</th>
            <th>עודכן לאחרונה</th>
            <th>פעולות</th>
          </tr>
        </thead>
        <tbody>
          {people.length === 0 ? (
            <tr>
              <td colSpan={8} className="empty-row">
                לא נמצאו נתונים לתצוגה
              </td>
            </tr>
          ) : (
            people.map((person) => (
              <tr key={person.person_id}>
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
                          onClick={() =>
                            onQuickUpdate(person.person_id, { location })
                          }
                        >
                          {location}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </td>
                <td>
                  <span
                    className={`status-chip ${
                      person.daily_status === "תקין"
                        ? "chip-status-ok"
                        : "chip-status-bad"
                    }`}
                  >
                    {person.daily_status}
                  </span>
                  {!readOnly ? (
                    <div className="quick-actions">
                      <button
                        className="btn btn-chip"
                        onClick={() =>
                          onQuickUpdate(person.person_id, { daily_status: "תקין" })
                        }
                      >
                        תקין
                      </button>
                      <button
                        className="btn btn-chip"
                        onClick={() =>
                          onQuickUpdate(person.person_id, {
                            daily_status: "לא תקין",
                          })
                        }
                      >
                        לא תקין
                      </button>
                    </div>
                  ) : null}
                </td>
                <td>
                  {person.self_location ? (
                    <span className={`status-chip ${getLocationChipClass(person.self_location)}`}>
                      {person.self_location}
                    </span>
                  ) : (
                    telegramActive ? "-" : ""
                  )}
                </td>
                <td>
                  {person.self_daily_status ? (
                    <span
                      className={`status-chip ${
                        person.self_daily_status === "תקין"
                          ? "chip-status-ok"
                          : "chip-status-bad"
                      }`}
                    >
                      {person.self_daily_status}
                    </span>
                  ) : (
                    telegramActive ? "-" : ""
                  )}
                </td>
                <td>{person.notes || "-"}</td>
                <td>{formatTimestamp(person.last_updated)}</td>
                <td>
                  <button
                    className="btn btn-secondary"
                    onClick={() => onEdit(person)}
                    disabled={readOnly}
                  >
                    עריכה
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default PersonTable;

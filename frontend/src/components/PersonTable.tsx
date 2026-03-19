// Main people table with quick status/location actions and per-row operations.
import PersonTableRow, { PersonRow } from "./PersonTableRow";

export type QuickUpdatePatch = {
  location?: string;
  daily_status?: string;
};

type PersonTableProps = {
  people: PersonRow[];
  locationOptions: string[];
  readOnly: boolean;
  telegramActive: boolean;
  telegramMessage: string;
  onQuickUpdate: (personId: string, patch: QuickUpdatePatch) => void;
  onEdit: (person: PersonRow) => void;
  onTrack: (person: PersonRow) => void;
};

// Render the main people table with quick actions for status/location updates.
const PersonTable = (props: PersonTableProps) => {
  const {
    people,
    locationOptions,
    readOnly,
    telegramActive,
    telegramMessage,
    onQuickUpdate,
    onEdit,
    onTrack,
  } = props;

  return (
    <div className="table-wrapper">
      <table className="people-table">
        <thead>
          <tr>
            <th>שם מלא</th>
            <th>מיקום נוכחי</th>
            <th>סטטוס יומי</th>
            <th>
              מיקום בהזנה עצמית
              {!telegramActive ? (
                <div className="column-note">{telegramMessage}</div>
              ) : null}
            </th>
            <th>
              סטטוס בהזנה עצמית
              {!telegramActive ? (
                <div className="column-note">{telegramMessage}</div>
              ) : null}
            </th>
            <th>הערות</th>
            <th>עודכן אחרונה</th>
            <th>פעולות</th>
          </tr>
        </thead>
        <tbody>
          {people.length === 0 ? (
            <tr>
              <td colSpan={8} className="empty-row">
                לא נמצאו נתונים להצגה
              </td>
            </tr>
          ) : (
            people.map((person) => (
              <PersonTableRow
                key={person.person_id}
                person={person}
                locationOptions={locationOptions}
                readOnly={readOnly}
                telegramActive={telegramActive}
                onQuickUpdate={onQuickUpdate}
                onEdit={onEdit}
                onTrack={onTrack}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default PersonTable;

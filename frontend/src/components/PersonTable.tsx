// Main users table with quick report actions for the selected date.
import PersonTableRow, { type PersonRow } from "./PersonTableRow";

export type QuickUpdatePatch = {
  location?: string;
  daily_status?: string;
};

type PersonTableProps = {
  people: PersonRow[];
  locationOptions: string[];
  readOnly: boolean;
  onQuickUpdate: (personId: string, patch: QuickUpdatePatch) => void;
};

// Render the main users table with quick actions for location/status updates.
const PersonTable = (props: PersonTableProps) => {
  const { people, locationOptions, readOnly, onQuickUpdate } = props;

  return (
    <div className="table-wrapper">
      <table className="people-table">
        <thead>
          <tr>
            <th>שם מלא</th>
            <th>מיקום נוכחי</th>
            <th>סטטוס יומי</th>
            <th>טלפון</th>
            <th>עודכן אחרונה</th>
          </tr>
        </thead>
        <tbody>
          {people.length === 0 ? (
            <tr>
              <td colSpan={5} className="empty-row">
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
                onQuickUpdate={onQuickUpdate}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default PersonTable;

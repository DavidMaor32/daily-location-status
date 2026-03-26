// Main users table with quick report actions for the selected date.
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import PersonTableRow from "./PersonTableRow";
import type { PersonRow, QuickUpdatePatch } from "../types/personTable";

export type { QuickUpdatePatch, PersonRow } from "../types/personTable";

type PersonTableProps = {
  people: PersonRow[];
  locationOptions: string[];
  readOnly: boolean;
  onQuickUpdate: (personId: string, patch: QuickUpdatePatch) => void;
};

const PersonTable = (props: PersonTableProps) => {
  const { people, locationOptions, readOnly, onQuickUpdate } = props;

  return (
    <TableContainer
      component={Paper}
      variant="outlined"
      sx={{ borderRadius: 1.5, maxHeight: "min(70vh, 720px)" }}
    >
      <Table size="small" stickyHeader sx={{ minWidth: 900 }}>
        <TableHead>
          <TableRow>
            <TableCell>שם מלא</TableCell>
            <TableCell>מיקום נוכחי</TableCell>
            <TableCell>סטטוס יומי</TableCell>
            <TableCell>טלפון</TableCell>
            <TableCell>עודכן אחרונה</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {people.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                <Typography color="text.secondary" fontWeight={600}>
                  לא נמצאו נתונים להצגה
                </Typography>
              </TableCell>
            </TableRow>
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
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default PersonTable;

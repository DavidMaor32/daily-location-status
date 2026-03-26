import { Box, Button, Stack, TableCell, TableRow } from "@mui/material";

import { getLocationChipClass } from "../constants/locations";
import { DAILY_STATUS_BAD, DAILY_STATUS_OK } from "../constants/statuses";
import type { PersonRow, QuickUpdatePatch } from "../types/personTable";
import { formatTimestamp } from "../utils/dates";

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
    <TableRow hover>
      <TableCell>{person.full_name}</TableCell>
      <TableCell>
        <span className={`status-chip ${getLocationChipClass(person.location)}`}>
          {person.location}
        </span>
        {!readOnly ? (
          <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 1 }} useFlexGap>
            {locationOptions.map((location) => (
              <Button
                key={location}
                size="small"
                variant="outlined"
                onClick={() => onQuickUpdate(person.person_id, { location })}
              >
                {location}
              </Button>
            ))}
          </Stack>
        ) : null}
      </TableCell>
      <TableCell>
        {!readOnly ? (
          <Stack direction="row" flexWrap="wrap" gap={0.75} useFlexGap>
            <Button
              size="small"
              variant={
                person.daily_status === DAILY_STATUS_OK ? "contained" : "outlined"
              }
              color="success"
              onClick={() =>
                onQuickUpdate(person.person_id, {
                  daily_status: DAILY_STATUS_OK,
                })
              }
            >
              תקין
            </Button>
            <Button
              size="small"
              variant={
                person.daily_status === DAILY_STATUS_BAD ? "contained" : "outlined"
              }
              color="error"
              onClick={() =>
                onQuickUpdate(person.person_id, {
                  daily_status: DAILY_STATUS_BAD,
                })
              }
            >
              לא תקין
            </Button>
          </Stack>
        ) : null}
      </TableCell>
      <TableCell>{person.phone || "-"}</TableCell>
      <TableCell>
        <Box component="span" sx={{ whiteSpace: "nowrap" }}>
          {formatTimestamp(person.last_updated)}
        </Box>
      </TableCell>
    </TableRow>
  );
};

export default PersonTableRow;

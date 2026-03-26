import { Box, CircularProgress, Paper, Typography } from "@mui/material";

import PersonTable from "./PersonTable";
import type { PersonRow, QuickUpdatePatch } from "../types/personTable";

type DashboardMainProps = {
  loading: boolean;
  filteredPeople: PersonRow[];
  selectedDate: string;
  todayString: string;
  locationOptions: string[];
  isReadOnly: boolean;
  actionLoading: boolean;
  reportsUnavailableMessage: string;
  onQuickUpdate: (personId: string, patch: QuickUpdatePatch) => void;
};

const DashboardMain = ({
  loading,
  filteredPeople,
  selectedDate,
  todayString,
  locationOptions,
  isReadOnly,
  actionLoading,
  reportsUnavailableMessage,
  onQuickUpdate,
}: DashboardMainProps) => (
  <Paper
    variant="outlined"
    component="main"
    sx={{ p: 2, borderRadius: 2, minHeight: 200 }}
  >
    {loading ? (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          py: 6,
        }}
      >
        <CircularProgress />
        <Typography color="text.secondary" fontWeight={600}>
          טוען נתונים...
        </Typography>
      </Box>
    ) : filteredPeople.length === 0 && selectedDate !== todayString ? (
      <Box
        sx={{
          py: 4,
          px: 2,
          textAlign: "center",
          borderRadius: 1.5,
          bgcolor: "action.hover",
        }}
      >
        <Typography fontWeight={600} color="text.secondary">
          {reportsUnavailableMessage}
        </Typography>
      </Box>
    ) : (
      <PersonTable
        people={filteredPeople}
        locationOptions={locationOptions}
        readOnly={isReadOnly || actionLoading}
        onQuickUpdate={onQuickUpdate}
      />
    )}
  </Paper>
);

export default DashboardMain;

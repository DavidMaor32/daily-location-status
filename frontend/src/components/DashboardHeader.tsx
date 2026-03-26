import {
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import type { Theme } from "../constants/theme";
import ThemeToggle from "./ThemeToggle";

type DashboardHeaderProps = {
  todayString: string;
  selectedDate: string;
  onSelectedDateChange: (value: string) => void;
  canLoadSelectedDate: boolean;
  canDownloadSelectedDate: boolean;
  onLoadSelectedDate: (date: string) => void;
  onDownloadDayFile: () => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
};

const DashboardHeader = ({
  todayString,
  selectedDate,
  onSelectedDateChange,
  canLoadSelectedDate,
  canDownloadSelectedDate,
  onLoadSelectedDate,
  onDownloadDayFile,
  theme,
  onThemeChange,
}: DashboardHeaderProps) => (
  <Paper
    variant="outlined"
    sx={{
      p: 2,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-end",
      flexWrap: "wrap",
      gap: 2,
      borderRadius: 2,
    }}
  >
    <Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
        ניהול סטטוס יומי ומיקום
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
        תצוגת משתמשים ודוחות לפי התאריך שנבחר
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        display="block"
        sx={{ mt: 0.5 }}
      >
        ה-API החדש מבוסס על דוחות. פעולות Snapshot ישנות הושבתו זמנית.
      </Typography>
    </Box>

    <Stack direction="row" spacing={1.25} alignItems="flex-end" flexWrap="wrap">
      <Stack spacing={0.5} alignItems="stretch">
        <Typography variant="caption" color="text.secondary">
          מראה
        </Typography>
        <ThemeToggle theme={theme} onThemeChange={onThemeChange} />
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        <TextField
          id="snapshot-date"
          label="בחירת תאריך"
          type="date"
          size="small"
          value={selectedDate}
          onChange={(event) => onSelectedDateChange(event.target.value)}
          slotProps={{
            htmlInput: { "data-testid": "snapshot-date-input", max: todayString },
            inputLabel: { shrink: true },
          }}
        />
        <Button
          variant="contained"
          data-testid="load-date-button"
          onClick={() => void onLoadSelectedDate(selectedDate)}
          disabled={!canLoadSelectedDate}
        >
          טען תאריך
        </Button>
        <Button
          variant="contained"
          onClick={onDownloadDayFile}
          disabled={!canDownloadSelectedDate}
        >
          הורד אקסל ליום
        </Button>
      </Stack>
    </Stack>
  </Paper>
);

export default DashboardHeader;

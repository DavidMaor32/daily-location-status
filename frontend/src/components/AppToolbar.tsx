import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import {
  DAILY_STATUS_BAD,
  DAILY_STATUS_MISSING,
  DAILY_STATUS_OK,
} from "../constants/statuses";

type AppToolbarProps = {
  actionLoading: boolean;
  canAddLocation: boolean;
  canChooseLocationToDelete: boolean;
  canDeleteLocation: boolean;
  locationOptions: string[];
  deletableLocationOptions: string[];
  downloadFromDate: string;
  downloadToDate: string;
  filteredPeopleCount: number;
  handleAddLocation: () => void | Promise<void>;
  handleDeleteLocation: () => void | Promise<void>;
  handleDownloadRangeFiles: () => void | Promise<void>;
  locationFilter: string;
  locationToDelete: string;
  newLocationName: string;
  onDownloadFromDateChange: (value: string) => void;
  onDownloadToDateChange: (value: string) => void;
  onLocationFilterChange: (value: string) => void;
  onLocationToDeleteChange: (value: string) => void;
  onNewLocationNameChange: (value: string) => void;
  onSearchTermChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  searchTerm: string;
  statusFilter: string;
  todayString: string;
};

function AppToolbar({
  actionLoading,
  canAddLocation,
  canChooseLocationToDelete: _canChooseLocationToDelete,
  canDeleteLocation: _canDeleteLocation,
  locationOptions,
  deletableLocationOptions: _deletableLocationOptions,
  downloadFromDate,
  downloadToDate,
  filteredPeopleCount,
  handleAddLocation,
  handleDeleteLocation: _handleDeleteLocation,
  handleDownloadRangeFiles,
  locationFilter,
  locationToDelete: _locationToDelete,
  newLocationName,
  onDownloadFromDateChange,
  onDownloadToDateChange,
  onLocationFilterChange,
  onLocationToDeleteChange: _onLocationToDeleteChange,
  onNewLocationNameChange,
  onSearchTermChange,
  onStatusFilterChange,
  searchTerm,
  statusFilter,
  todayString,
}: AppToolbarProps) {
  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, borderRadius: 2 }}
      component="section"
    >
      <Stack direction="row" flexWrap="wrap" gap={2} alignItems="flex-end">
        <TextField
          label="חיפוש לפי שם"
          placeholder="הקלד שם..."
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
          size="small"
          sx={{ minWidth: 118, maxWidth: 160 }}
        />

        <FormControl size="small" sx={{ minWidth: 118, maxWidth: 140 }}>
          <InputLabel id="location-filter-label">פילטר מיקום</InputLabel>
          <Select
            labelId="location-filter-label"
            label="פילטר מיקום"
            value={locationFilter}
            onChange={(event) => onLocationFilterChange(String(event.target.value))}
          >
            <MenuItem value="all">הכול</MenuItem>
            {locationOptions.map((location) => (
              <MenuItem key={location} value={location}>
                {location}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 118, maxWidth: 140 }}>
          <InputLabel id="status-filter-label">פילטר סטטוס</InputLabel>
          <Select
            labelId="status-filter-label"
            label="פילטר סטטוס"
            value={statusFilter}
            onChange={(event) => onStatusFilterChange(String(event.target.value))}
          >
            <MenuItem value="all">הכול</MenuItem>
            <MenuItem value={DAILY_STATUS_OK}>תקין</MenuItem>
            <MenuItem value={DAILY_STATUS_BAD}>לא תקין</MenuItem>
            <MenuItem value={DAILY_STATUS_MISSING}>לא הוזן</MenuItem>
          </Select>
        </FormControl>

        <Box sx={{ minWidth: 250, flex: "1 1 240px" }}>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
            הוספת מיקום
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <TextField
              size="small"
              fullWidth
              placeholder={'לדוגמה: "מיקום 6"'}
              value={newLocationName}
              onChange={(event) => onNewLocationNameChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleAddLocation();
                }
              }}
            />
            <Button
              variant="outlined"
              onClick={() => void handleAddLocation()}
              disabled={!canAddLocation}
              sx={{ flexShrink: 0 }}
            >
              הוסף מיקום
            </Button>
          </Stack>
        </Box>

        <Box sx={{ minWidth: 280, flex: "1 1 280px" }}>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
            הורד דוחות לפי טווח
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <TextField
              type="date"
              size="small"
              value={downloadFromDate}
              onChange={(event) => onDownloadFromDateChange(event.target.value)}
              slotProps={{
                htmlInput: { max: todayString },
                inputLabel: { shrink: true },
              }}
              sx={{ width: 150 }}
            />
            <TextField
              type="date"
              size="small"
              value={downloadToDate}
              onChange={(event) => onDownloadToDateChange(event.target.value)}
              slotProps={{
                htmlInput: { max: todayString },
                inputLabel: { shrink: true },
              }}
              sx={{ width: 150 }}
            />
            <Button
              variant="outlined"
              onClick={() => void handleDownloadRangeFiles()}
              disabled={actionLoading}
            >
              הורד אקסל
            </Button>
          </Stack>
        </Box>

        <Stack alignItems="center" sx={{ minWidth: 90, pb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            סה&quot;כ מוצגים
          </Typography>
          <Typography variant="h6" component="strong">
            {filteredPeopleCount}
          </Typography>
        </Stack>
      </Stack>
    </Paper>
  );
}

export default AppToolbar;

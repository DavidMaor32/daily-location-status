import { Chip, Paper, Stack, Typography } from "@mui/material";

type AvailableDateChipsProps = {
  availableDates: string[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
};

const AvailableDateChips = ({
  availableDates,
  selectedDate,
  onSelectDate,
}: AvailableDateChipsProps) => {
  if (availableDates.length === 0) {
    return null;
  }

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }} component="section">
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="body2" color="text.secondary">
          תאריכים זמינים:
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={1} useFlexGap>
          {availableDates.map((item) => (
            <Chip
              key={item}
              label={item}
              onClick={() => void onSelectDate(item)}
              color={item === selectedDate ? "primary" : "default"}
              variant={item === selectedDate ? "filled" : "outlined"}
              size="small"
              sx={{ fontWeight: item === selectedDate ? 700 : 500 }}
            />
          ))}
        </Stack>
      </Stack>
    </Paper>
  );
};

export default AvailableDateChips;

import { ToggleButton, ToggleButtonGroup } from "@mui/material";

import type { Theme } from "../constants/theme";

type ThemeToggleProps = {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
};

const ThemeToggle = ({ theme, onThemeChange }: ThemeToggleProps) => (
  <ToggleButtonGroup
    exclusive
    value={theme}
    onChange={(_, value: Theme | null) => {
      if (value) {
        onThemeChange(value);
      }
    }}
    size="small"
    aria-label="ערכת נושא"
    sx={{
      "& .MuiToggleButton-root": {
        px: 1.5,
        py: 0.5,
        textTransform: "none",
        fontWeight: 600,
      },
    }}
  >
    <ToggleButton value="light" aria-pressed={theme === "light"}>
      בהיר
    </ToggleButton>
    <ToggleButton value="dark" aria-pressed={theme === "dark"}>
      כהה
    </ToggleButton>
  </ToggleButtonGroup>
);

export default ThemeToggle;

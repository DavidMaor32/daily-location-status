import { useThemeMode } from "../theme/AppThemeProvider";

/** App light/dark preference (synced to MUI ThemeProvider + localStorage). */
export function useTheme() {
  return useThemeMode();
}

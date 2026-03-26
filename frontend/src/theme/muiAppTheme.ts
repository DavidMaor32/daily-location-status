import { createTheme } from "@mui/material/styles";

import type { Theme as AppColorMode } from "../constants/theme";

const lightBodyBg =
  "linear-gradient(135deg, #f7fbff 0%, #e7f1f7 45%, #f3f7ef 100%)";
const darkBodyBg =
  "linear-gradient(135deg, #0d1117 0%, #161b22 45%, #0f1419 100%)";

export function createAppMuiTheme(mode: AppColorMode) {
  const paletteMode = mode === "dark" ? "dark" : "light";

  return createTheme({
    direction: "rtl",
    palette: {
      mode: paletteMode,
      primary: { main: mode === "light" ? "#155b8a" : "#58a6ff" },
      secondary: { main: mode === "light" ? "#5c6f7d" : "#8b9cad" },
      success: { main: mode === "light" ? "#1f6d30" : "#56d364" },
      error: { main: mode === "light" ? "#8a1f2a" : "#ff7b72" },
      warning: { main: mode === "light" ? "#b86a00" : "#d29922" },
    },
    typography: {
      fontFamily: '"Assistant", "Segoe UI", "Helvetica", "Arial", sans-serif',
    },
    shape: { borderRadius: 12 },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            background: mode === "dark" ? darkBodyBg : lightBodyBg,
            backgroundAttachment: "fixed",
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { textTransform: "none", fontWeight: 600 },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundImage: "none",
          },
        },
      },
    },
  });
}

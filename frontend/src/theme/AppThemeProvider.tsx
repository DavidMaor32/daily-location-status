import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { prefixer } from "stylis";
import rtlPlugin from "stylis-plugin-rtl";

import {
  resolveInitialTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from "../constants/theme";
import { createAppMuiTheme } from "./muiAppTheme";

const rtlCache = createCache({
  key: "muirtl",
  prepend: true,
  stylisPlugins: [prefixer, rtlPlugin],
});

export type ThemeModeContextValue = {
  theme: Theme;
  setTheme: (next: Theme) => void;
  toggleTheme: () => void;
};

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export function useThemeMode(): ThemeModeContextValue {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) {
    throw new Error("useThemeMode must be used within AppThemeProvider");
  }
  return ctx;
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => resolveInitialTheme());

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.dataset.theme = "dark";
    } else {
      root.removeAttribute("data-theme");
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => (current === "light" ? "dark" : "light"));
  }, []);

  const muiTheme = useMemo(() => createAppMuiTheme(theme), [theme]);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme]
  );

  return (
    <CacheProvider value={rtlCache}>
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        <ThemeModeContext.Provider value={value}>
          {children}
        </ThemeModeContext.Provider>
      </ThemeProvider>
    </CacheProvider>
  );
}

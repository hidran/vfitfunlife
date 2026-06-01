'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'vfit.theme';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function applyNativeStatusBar(theme: Theme) {
  import('@capacitor/core')
    .then(({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) return;
      // Style.Dark = dark icons (for light backgrounds); Style.Light = light icons (for dark).
      import('@capacitor/status-bar')
        .then(({ StatusBar, Style }) =>
          StatusBar.setStyle({ style: theme === 'light' ? Style.Dark : Style.Light }),
        )
        .catch(() => {});
    })
    .catch(() => {});
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // First render must match the static prerender, which is always dark (no
  // attribute / window at build time). The real choice is read after mount,
  // and a tiny inline script in the root layout sets data-theme pre-hydration
  // to avoid a flash.
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    if ((stored === 'light' || stored === 'dark') && stored !== theme) {
      setThemeState(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = theme;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
    applyNativeStatusBar(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const toggle = useCallback(
    () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark')),
    [],
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Resilient fallback so a consumer rendered briefly without the provider
    // (hydration/Fast Refresh) degrades to dark instead of crashing.
    return { theme: 'dark', setTheme: () => {}, toggle: () => {} };
  }
  return ctx;
}

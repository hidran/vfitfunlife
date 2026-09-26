'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuthStore } from '@/stores/authStore';

export type Theme = 'dark' | 'light';
export type ThemePreference = Theme | 'system';

const STORAGE_KEY = 'vfit.theme';

interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
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

function systemTheme(): Theme {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

function afterCurrentEffect(callback: () => void): void {
  if (typeof window !== 'undefined' && typeof window.queueMicrotask === 'function') {
    window.queueMicrotask(callback);
    return;
  }
  setTimeout(callback, 0);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // First render must match the static prerender, which is always dark (no
  // attribute / window at build time). The real choice is read after mount,
  // and a tiny inline script in the root layout sets data-theme pre-hydration
  // to avoid a flash.
  const [theme, setThemeState] = useState<Theme>('dark');
  const [preference, setPreference] = useState<ThemePreference>('system');

  // Theme saved on the user's Firestore profile (follows them across devices).
  const remoteTheme = useAuthStore((s) => s.user?.theme);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    afterCurrentEffect(() => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setPreference(stored);
        setThemeState(stored === 'system' ? systemTheme() : stored);
      } else {
        setThemeState(systemTheme());
      }
    });
  }, []);

  // When a logged-in user's saved theme loads, adopt it (profile wins over the
  // device default). Uses setThemeState directly so it isn't re-persisted.
  useEffect(() => {
    if (remoteTheme === 'light' || remoteTheme === 'dark') {
      afterCurrentEffect(() => {
        setPreference(remoteTheme);
        setThemeState((cur) => (cur === remoteTheme ? cur : remoteTheme));
      });
    }
  }, [remoteTheme]);

  // Persist an explicit user choice to their profile (best-effort; localStorage
  // already covers the device + logged-out case).
  const persistRemote = useCallback((next: ThemePreference) => {
    const uid = useAuthStore.getState().user?.id;
    if (!uid || next === 'system') return;
    void updateDoc(doc(db, 'users', uid), { theme: next }).catch(() => {});
  }, []);

  useEffect(() => {
    if (preference !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const update = () => setThemeState(media.matches ? 'light' : 'dark');
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, [preference]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = theme;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      /* ignore */
    }
    applyNativeStatusBar(theme);
  }, [preference, theme]);

  const setTheme = useCallback(
    (next: ThemePreference) => {
      setPreference(next);
      setThemeState(next === 'system' ? systemTheme() : next);
      persistRemote(next);
    },
    [persistRemote],
  );
  const toggle = useCallback(
    () => {
      setPreference((prevPreference) => {
        const next: Theme = prevPreference === 'dark' ? 'light' : 'dark';
        persistRemote(next);
        return next;
      });
      setThemeState((prev) => {
        const next: Theme = prev === 'dark' ? 'light' : 'dark';
        return next;
      });
    },
    [persistRemote],
  );

  return (
    <ThemeContext.Provider value={{ theme, preference, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Resilient fallback so a consumer rendered briefly without the provider
    // (hydration/Fast Refresh) degrades to dark instead of crashing.
    return { theme: 'dark', preference: 'system', setTheme: () => {}, toggle: () => {} };
  }
  return ctx;
}

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
// Firestore is resolved lazily: this provider wraps every route, and a static
// firebase/firestore import would put the whole SDK in the shared root bundle.
import { loadFirestore } from '@/lib/firebase/lazyFirestore';
import { useAuthStore } from '@/stores/authStore';
import {
  clearExplicitChoice,
  markExplicitChoice,
  readExplicitChoice,
} from '@/lib/preferences/explicitChoice';

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

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
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

function currentUid(): string | undefined {
  const user = useAuthStore.getState().user;
  return user?.id ?? user?.uid;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // First render must match the static prerender, which is always dark (no
  // attribute / window at build time). The real choice is read after mount,
  // and a tiny inline script in the root layout sets data-theme pre-hydration
  // to avoid a flash.
  const [theme, setThemeState] = useState<Theme>('dark');
  const [preference, setPreference] = useState<ThemePreference>('system');

  // Theme saved on the user's Firestore profile (follows them across devices).
  const uid = useAuthStore((s) => s.user?.id ?? s.user?.uid);
  const remoteTheme = useAuthStore((s) => s.user?.theme);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    afterCurrentEffect(() => {
      if (isThemePreference(stored)) {
        setPreference(stored);
        setThemeState(stored === 'system' ? systemTheme() : stored);
      } else {
        setThemeState(systemTheme());
      }
    });
  }, []);

  // Persist a choice to the user's profile (best-effort; localStorage already covers the
  // device + logged-out case). 'system' is persisted too, so choosing it sticks instead of
  // being overridden by a previously saved light/dark on the next load.
  const persistRemote = useCallback((userId: string, next: ThemePreference) => {
    void loadFirestore()
      .then(({ db, doc, updateDoc }) => updateDoc(doc(db, 'users', userId), { theme: next }))
      .then(() => {
        // Mirror locally so the store's profile matches what was written.
        useAuthStore.setState((state) =>
          state.user && (state.user.id ?? state.user.uid) === userId && state.user.theme !== next
            ? { user: { ...state.user, theme: next } }
            : {},
        );
      })
      .catch(() => {});
  }, []);

  // The uid whose login has already consumed the explicit pre-login marker.
  const handledUid = useRef<string | null>(null);

  // When a logged-in user's saved theme loads, adopt it (profile wins over the device
  // default, cross-device) — unless the user explicitly picked a theme while logged out,
  // in which case that choice is written to the profile instead. Adopting a remote value
  // uses setThemeState directly so it isn't re-persisted.
  useEffect(() => {
    if (!uid) {
      handledUid.current = null;
      return;
    }
    if (handledUid.current !== uid) {
      handledUid.current = uid;
      const explicit = readExplicitChoice('theme');
      if (explicit) clearExplicitChoice('theme');
      if (explicit && isThemePreference(explicit.value)) {
        const chosen = explicit.value;
        afterCurrentEffect(() => {
          setPreference(chosen);
          setThemeState(chosen === 'system' ? systemTheme() : chosen);
        });
        if (remoteTheme !== chosen) persistRemote(uid, chosen);
        return;
      }
    }
    if (isThemePreference(remoteTheme)) {
      afterCurrentEffect(() => {
        setPreference(remoteTheme);
        const next = remoteTheme === 'system' ? systemTheme() : remoteTheme;
        setThemeState((cur) => (cur === next ? cur : next));
      });
    }
  }, [uid, remoteTheme, persistRemote]);

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

  // Latest resolved theme, so toggle() needs no side effect inside a state updater.
  const themeRef = useRef<Theme>(theme);
  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  const setTheme = useCallback(
    (next: ThemePreference) => {
      setPreference(next);
      setThemeState(next === 'system' ? systemTheme() : next);
      const userId = currentUid();
      if (userId) {
        clearExplicitChoice('theme');
        persistRemote(userId, next);
      } else {
        // Logged out: remember this was a deliberate pick so login saves it to the
        // profile rather than overwriting it with the profile's value.
        markExplicitChoice('theme', next);
      }
    },
    [persistRemote],
  );

  const toggle = useCallback(() => {
    setTheme(themeRef.current === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, preference, setTheme, toggle }),
    [theme, preference, setTheme, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
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

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getMessage, type MessageKey } from '@/i18n/messages';
import { detectBrowserLocale, detectDeviceLocale } from '@/lib/i18n/detectLocale';
import {
  DEFAULT_LOCALE,
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  isSupportedLocale,
  type AppLocale,
} from '@/types/locale';

const STORAGE_KEY = 'vfit.locale';

export interface TranslateValues {
  [key: string]: string | number;
}

interface I18nContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  locales: typeof SUPPORTED_LOCALES;
  localeLabels: typeof LOCALE_LABELS;
  t: (key: MessageKey, values?: TranslateValues) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

function interpolate(message: string, values?: TranslateValues): string {
  if (!values) return message;

  return Object.entries(values).reduce((text, [key, value]) => {
    return text.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), String(value));
  }, message);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // First render MUST match the static prerender, which always uses
  // DEFAULT_LOCALE (window is undefined at build time). Reading localStorage or
  // navigator.language during the initial render would mismatch the server HTML
  // and trigger React error #418 (hydration text mismatch) — see
  // /admin/venues regression where the cascade tore down the I18nProvider
  // subtree.
  const [locale, setLocaleState] = useState<AppLocale>(DEFAULT_LOCALE);

  // After mount, resolve the real locale (stored choice > browser > default)
  // and switch. This causes one extra render but keeps hydration safe.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && isSupportedLocale(stored)) {
      if (stored !== DEFAULT_LOCALE) setLocaleState(stored);
      return;
    }
    const browser = detectBrowserLocale();
    if (browser && browser !== DEFAULT_LOCALE) setLocaleState(browser);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, locale);
      document.documentElement.lang = locale;
    }
  }, [locale]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && isSupportedLocale(stored)) return; // explicit/prior choice wins
    let cancelled = false;
    detectDeviceLocale().then((deviceLocale) => {
      if (!cancelled && deviceLocale) setLocaleState(deviceLocale);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback((nextLocale: AppLocale) => {
    setLocaleState(nextLocale);
  }, []);

  const t = useCallback(
    (key: MessageKey, values?: TranslateValues) => {
      const message = getMessage(locale, key);
      return interpolate(message, values);
    },
    [locale]
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      locales: SUPPORTED_LOCALES,
      localeLabels: LOCALE_LABELS,
      t,
    }),
    [locale, setLocale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// Safe fallback used when a consumer renders for a frame without an I18nProvider
// ancestor — e.g. during a hydration mismatch recovery, an ErrorBoundary reset,
// or a Fast Refresh remount, where the provider subtree is briefly torn down and
// re-created. Throwing here turns that transient gap into a fatal app crash
// ("useI18nContext must be used within I18nProvider"); degrading to the default
// locale instead lets the component render and recover on the next pass.
const FALLBACK_I18N: I18nContextValue = {
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  locales: SUPPORTED_LOCALES,
  localeLabels: LOCALE_LABELS,
  t: (key, values) => interpolate(getMessage(DEFAULT_LOCALE, key), values),
};

export function useI18nContext() {
  const context = useContext(I18nContext);
  if (!context) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[i18n] useI18nContext used without an I18nProvider ancestor; ' +
          'falling back to the default locale for this render.'
      );
    }
    return FALLBACK_I18N;
  }
  return context;
}

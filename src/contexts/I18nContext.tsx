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

function getBrowserLocale(): AppLocale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;

  const candidates = [window.navigator.language, ...window.navigator.languages]
    .filter(Boolean)
    .map((value) => value.toLowerCase().split('-')[0]);

  for (const candidate of candidates) {
    if (isSupportedLocale(candidate)) {
      return candidate;
    }
  }

  return DEFAULT_LOCALE;
}

function resolveInitialLocale(): AppLocale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && isSupportedLocale(stored)) {
    return stored;
  }

  return getBrowserLocale();
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(() => resolveInitialLocale());

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, locale);
      document.documentElement.lang = locale;
    }
  }, [locale]);

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

export function useI18nContext() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18nContext must be used within I18nProvider');
  }
  return context;
}

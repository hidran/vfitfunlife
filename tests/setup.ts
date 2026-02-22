import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { itMessages } from '@/i18n/messages/it';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock Firebase
vi.mock('@/lib/firebase/config', () => ({
  auth: {},
  db: {},
  storage: {},
  functions: {},
}));

// Mock Capacitor
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => false,
    getPlatform: () => 'web',
  },
}));

// Mock i18n hook with Italian dictionary so tests can assert localized copy.
vi.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    locale: 'it',
    setLocale: vi.fn(),
    t: (key: string, params?: Record<string, string | number>) => {
      const raw = (itMessages as Record<string, string>)[key] ?? key;
      if (!params) return raw;

      return Object.entries(params).reduce(
        (result, [name, value]) => result.replace(new RegExp(`{{\\s*${name}\\s*}}`, 'g'), String(value)),
        raw
      );
    },
  }),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: { [key: string]: string } = {};
  return {
    getItem(key: string) {
      return store[key] || null;
    },
    setItem(key: string, value: string) {
      store[key] = value.toString();
    },
    clear() {
      store = {};
    },
    removeItem(key: string) {
      delete store[key];
    },
  };
})();
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

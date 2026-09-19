import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { itMessages } from '@/i18n/messages/it';

// The root vitest config has no `include`, so it also picks up functions/test/*.test.ts —
// but with this setup file, not functions/test/setup.ts. Those tests drive the Admin SDK,
// which without these two variables tries to reach REAL Firestore for a project the
// caller has no access to, and every one of them fails on PERMISSION_DENIED. Pointing it
// at the emulator is what makes them exercise anything.
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-vfit-test';
process.env.FIRESTORE_EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';

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
    locales: ['it', 'en', 'es', 'fr', 'de'],
    localeLabels: {
      it: 'Italiano',
      en: 'English',
      es: 'Español',
      fr: 'Français',
      de: 'Deutsch',
    },
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

// Registration tests render the provider opt-in field without the app-level
// QueryClientProvider; keep this shared fixture deterministic and network-free.
vi.mock('@/hooks/useServiceCategories', () => {
  type Category = { id: string; parentId: string | null; name: string; icon: string };
  const group: Category = { id: 'strength_conditioning', parentId: null, name: 'Forza e Condizionamento', icon: '💪' };
  const leaf: Category = { id: 'personal_training', parentId: 'strength_conditioning', name: 'Personal Training', icon: '🏋️' };
  return {
    useServiceCategories: () => [group, leaf],
    useServiceCategoryLeaves: () => [leaf],
    useServiceCategoryGroups: () => [{ group, leaves: [leaf] }],
    useServiceCategoryMap: () => new Map([[group.id, group], [leaf.id, leaf]]),
  };
});

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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const setLocale = vi.fn();
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ setLocale }) }));

const loadUserData = vi.fn().mockResolvedValue(null);
let mockUser: { uid: string } | null = null;
vi.mock('@/stores/authStore', () => ({
  useAuthStore: { getState: () => ({ user: mockUser, loadUserData }) },
}));

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, col, id) => ({ col, id })),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  serverTimestamp: vi.fn(() => 'TS'),
}));

import { updateDoc } from 'firebase/firestore';
import { useChangeLocale } from './useChangeLocale';

beforeEach(() => { vi.clearAllMocks(); mockUser = null; });

it('logged-out: sets locale, does not persist', async () => {
  const { result } = renderHook(() => useChangeLocale());
  await result.current('fr');
  expect(setLocale).toHaveBeenCalledWith('fr');
  expect(updateDoc).not.toHaveBeenCalled();
});

it('logged-in: sets locale and persists preferredLanguage', async () => {
  mockUser = { uid: 'u1' };
  const { result } = renderHook(() => useChangeLocale());
  await result.current('de');
  expect(setLocale).toHaveBeenCalledWith('de');
  expect(updateDoc).toHaveBeenCalledWith({ col: 'users', id: 'u1' }, expect.objectContaining({ preferredLanguage: 'de' }));
  expect(loadUserData).toHaveBeenCalledWith('u1');
});

it('persist failure does not throw and still sets locale', async () => {
  mockUser = { uid: 'u1' };
  vi.mocked(updateDoc).mockRejectedValueOnce(new Error('offline'));
  const { result } = renderHook(() => useChangeLocale());
  await expect(result.current('es')).resolves.toBeUndefined();
  expect(setLocale).toHaveBeenCalledWith('es');
});

it('logged-out: marks the choice as an explicit pre-login pick', async () => {
  window.localStorage.clear();
  const { result } = renderHook(() => useChangeLocale());
  await result.current('en');
  expect(JSON.parse(window.localStorage.getItem('vfit.locale.explicit') ?? '{}')).toMatchObject({ value: 'en' });
});

it('logged-in: does not leave an explicit pre-login marker', async () => {
  window.localStorage.setItem('vfit.locale.explicit', JSON.stringify({ value: 'fr', at: 1 }));
  mockUser = { uid: 'u1' };
  const { result } = renderHook(() => useChangeLocale());
  await result.current('de');
  expect(window.localStorage.getItem('vfit.locale.explicit')).toBeNull();
});

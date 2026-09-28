import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const i18n = vi.hoisted(() => ({ locale: 'it', setLocale: vi.fn() }));
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => i18n }));

vi.mock('@/stores/authStore', async () => {
  const { create } = await import('zustand');
  return {
    useAuthStore: create<{ user: Record<string, unknown> | null }>(() => ({ user: null })),
  };
});

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, col, id) => ({ col, id })),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  serverTimestamp: vi.fn(() => 'TS'),
}));

import { updateDoc } from 'firebase/firestore';
import { useAuthStore } from '@/stores/authStore';
import { markExplicitChoice, readExplicitChoice } from '@/lib/preferences/explicitChoice';
import { useProfilePreferencesSync } from './useProfilePreferencesSync';

type TestUser = { uid: string; id: string; preferredLanguage?: string };
const login = (user: TestUser | null) =>
  act(() => {
    (useAuthStore as unknown as { setState: (s: unknown) => void }).setState({ user });
  });
const storeUser = () =>
  (useAuthStore as unknown as { getState: () => { user: TestUser | null } }).getState().user;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  i18n.locale = 'it';
  i18n.setLocale.mockImplementation(async (l: string) => {
    i18n.locale = l;
  });
  (useAuthStore as unknown as { setState: (s: unknown) => void }).setState({ user: null });
});

describe('useProfilePreferencesSync', () => {
  it('logged out: does nothing', () => {
    renderHook(() => useProfilePreferencesSync());
    expect(i18n.setLocale).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('without an explicit pre-login choice, the profile language wins', () => {
    renderHook(() => useProfilePreferencesSync());
    login({ uid: 'u1', id: 'u1', preferredLanguage: 'en' });
    expect(i18n.setLocale).toHaveBeenCalledWith('en');
    expect(i18n.setLocale).toHaveBeenCalledTimes(1);
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('an explicit pre-login choice is written to the profile instead of being overwritten', async () => {
    i18n.locale = 'fr';
    markExplicitChoice('locale', 'fr');
    renderHook(() => useProfilePreferencesSync());
    login({ uid: 'u1', id: 'u1', preferredLanguage: 'it' });

    expect(i18n.setLocale).not.toHaveBeenCalledWith('it');
    expect(updateDoc).toHaveBeenCalledWith(
      { col: 'users', id: 'u1' },
      expect.objectContaining({ preferredLanguage: 'fr' }),
    );
    expect(readExplicitChoice('locale')).toBeNull();
    await waitFor(() => expect(storeUser()?.preferredLanguage).toBe('fr'));
    expect(i18n.setLocale).not.toHaveBeenCalledWith('it');
  });

  it('an explicit choice equal to the profile just clears the marker', () => {
    i18n.locale = 'en';
    markExplicitChoice('locale', 'en');
    renderHook(() => useProfilePreferencesSync());
    login({ uid: 'u1', id: 'u1', preferredLanguage: 'en' });
    expect(updateDoc).not.toHaveBeenCalled();
    expect(i18n.setLocale).not.toHaveBeenCalled();
    expect(readExplicitChoice('locale')).toBeNull();
  });

  it('the marker is consumed once: a later profile change is applied', () => {
    markExplicitChoice('locale', 'fr');
    i18n.locale = 'fr';
    renderHook(() => useProfilePreferencesSync());
    login({ uid: 'u1', id: 'u1', preferredLanguage: 'fr' });
    login({ uid: 'u1', id: 'u1', preferredLanguage: 'de' });
    expect(i18n.setLocale).toHaveBeenLastCalledWith('de');
  });

  it('after logout, the next account gets its own profile language', () => {
    renderHook(() => useProfilePreferencesSync());
    login({ uid: 'u1', id: 'u1', preferredLanguage: 'en' });
    login(null);
    login({ uid: 'u2', id: 'u2', preferredLanguage: 'es' });
    expect(i18n.setLocale).toHaveBeenLastCalledWith('es');
  });
});

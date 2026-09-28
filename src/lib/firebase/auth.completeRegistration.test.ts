import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./config', () => ({ auth: {}, db: {}, functions: {} }));
vi.mock('./nativeAuth', () => ({ nativeGoogleSignIn: vi.fn(), nativeAppleSignIn: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ col, id })),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'TS'),
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
}));

import { getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { completeRegistration } from './auth';

function written(fn: typeof setDoc | typeof updateDoc) {
  return vi.mocked(fn).mock.calls[0][1] as unknown as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
});

describe('completeRegistration preferredLanguage', () => {
  it('uses the explicitly passed locale', async () => {
    window.localStorage.setItem('vfit.locale', 'fr');
    await completeRegistration('u1', { fullName: 'A', preferredLanguage: 'de' });
    expect(written(setDoc).preferredLanguage).toBe('de');
  });

  it('falls back to the current UI locale, not a hardcoded Italian', async () => {
    window.localStorage.setItem('vfit.locale', 'en');
    await completeRegistration('u1', { fullName: 'A' });
    expect(written(setDoc).preferredLanguage).toBe('en');
  });

  it('falls back to DEFAULT_LOCALE when nothing usable is stored', async () => {
    window.localStorage.setItem('vfit.locale', 'xx');
    await completeRegistration('u1', { fullName: 'A' });
    expect(written(setDoc).preferredLanguage).toBe('it');
  });

  it('writes the locale onto a server-precreated profile too', async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => true } as never);
    await completeRegistration('u1', { fullName: 'A', preferredLanguage: 'es' });
    expect(written(updateDoc).preferredLanguage).toBe('es');
  });
});

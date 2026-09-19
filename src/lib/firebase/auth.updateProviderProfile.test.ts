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

import { getDoc, updateDoc } from 'firebase/firestore';
import { updateProviderProfile } from './auth';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDoc).mockResolvedValue({
    exists: () => true,
    data: () => ({ providerProfile: { professionalBio: 'Old bio', rating: 4.8 } }),
  } as never);
});

describe('updateProviderProfile', () => {
  it('skips undefined fields, which Firestore rejects inside a map', async () => {
    await updateProviderProfile('u1', { professionalBio: undefined, yearsOfExperience: 3 });

    const written = vi.mocked(updateDoc).mock.calls[0][1] as unknown as { providerProfile: Record<string, unknown> };
    expect(Object.values(written.providerProfile)).not.toContain(undefined);
    expect(written.providerProfile).toEqual({ professionalBio: 'Old bio', rating: 4.8, yearsOfExperience: 3 });
  });

  it('lets an empty string clear a field', async () => {
    await updateProviderProfile('u1', { professionalBio: '' });

    const written = vi.mocked(updateDoc).mock.calls[0][1] as unknown as { providerProfile: Record<string, unknown> };
    expect(written.providerProfile.professionalBio).toBe('');
  });
});

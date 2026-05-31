import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ col, id })),
  writeBatch: vi.fn(),
  serverTimestamp: vi.fn(() => 'TS'),
}));

import { writeBatch } from 'firebase/firestore';
import { submitProviderApplication, setProviderApplicationStatus } from './providerApplication';

function makeBatch() {
  return { set: vi.fn(), update: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };
}

beforeEach(() => vi.clearAllMocks());

describe('submitProviderApplication', () => {
  it('creates a pending unverified instructor doc and sets user providerStatus=pending', async () => {
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as never);

    await submitProviderApplication('u1', { fullName: 'Mia Rossi', categories: ['Yoga', 'Pilates'] });

    expect(batch.set).toHaveBeenCalledWith(
      { col: 'instructors', id: 'u1' },
      expect.objectContaining({
        uid: 'u1',
        applicationStatus: 'pending',
        providerProfile: expect.objectContaining({ isVerified: false, specialties: ['Yoga', 'Pilates'] }),
      }),
      { merge: true }
    );
    expect(batch.update).toHaveBeenCalledWith(
      { col: 'users', id: 'u1' },
      expect.objectContaining({ providerStatus: 'pending' })
    );
    expect(batch.commit).toHaveBeenCalled();
  });
});

describe('setProviderApplicationStatus', () => {
  it('verifying sets isVerified true + both statuses verified', async () => {
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as never);

    await setProviderApplicationStatus('u1', 'verified');

    expect(batch.update).toHaveBeenCalledWith(
      { col: 'instructors', id: 'u1' },
      expect.objectContaining({ applicationStatus: 'verified', 'providerProfile.isVerified': true })
    );
    expect(batch.update).toHaveBeenCalledWith(
      { col: 'users', id: 'u1' },
      expect.objectContaining({ providerStatus: 'verified' })
    );
  });

  it('rejecting sets rejected and leaves isVerified false', async () => {
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as never);

    await setProviderApplicationStatus('u1', 'rejected');

    expect(batch.update).toHaveBeenCalledWith(
      { col: 'instructors', id: 'u1' },
      expect.objectContaining({ applicationStatus: 'rejected', 'providerProfile.isVerified': false })
    );
    expect(batch.update).toHaveBeenCalledWith(
      { col: 'users', id: 'u1' },
      expect.objectContaining({ providerStatus: 'rejected' })
    );
  });
});

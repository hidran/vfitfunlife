import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ col, id })),
  writeBatch: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'TS'),
}));

import { writeBatch, updateDoc } from 'firebase/firestore';
import { submitProviderApplication, updateRequestedCategories } from './providerApplication';

function makeBatch() {
  return { set: vi.fn(), update: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };
}

beforeEach(() => vi.clearAllMocks());

describe('submitProviderApplication', () => {
  it('stores the requested category ids on a pending unverified instructor doc', async () => {
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as never);

    await submitProviderApplication('u1', { fullName: 'Mia Rossi', categoryIds: ['yoga', 'pilates'] });

    expect(batch.set).toHaveBeenCalledWith(
      { col: 'instructors', id: 'u1' },
      expect.objectContaining({
        uid: 'u1',
        applicationStatus: 'pending',
        requestedCategoryIds: ['yoga', 'pilates'],
        providerProfile: expect.objectContaining({ isVerified: false }),
      }),
      { merge: true }
    );
    expect(batch.update).toHaveBeenCalledWith(
      { col: 'users', id: 'u1' },
      { providerStatus: 'pending', updatedAt: 'TS' }
    );
    expect(batch.commit).toHaveBeenCalled();
  });

  it('no longer writes display names into the legacy specialties field', async () => {
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as never);

    await submitProviderApplication('u1', { fullName: 'Mia Rossi', categoryIds: ['yoga'] });

    const instructorDoc = batch.set.mock.calls[0][1] as { providerProfile: Record<string, unknown> };
    expect(instructorDoc.providerProfile).not.toHaveProperty('specialties');
  });
});

describe('updateRequestedCategories', () => {
  it('updates the requested category ids on the instructor doc', async () => {
    await updateRequestedCategories('u1', ['boxing']);

    expect(updateDoc).toHaveBeenCalledWith(
      { col: 'instructors', id: 'u1' },
      { requestedCategoryIds: ['boxing'], updatedAt: 'TS' }
    );
  });
});

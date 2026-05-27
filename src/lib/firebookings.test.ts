import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(() => ({ __q: true })),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  Timestamp: { fromDate: vi.fn((d) => d) },
  serverTimestamp: vi.fn(() => null),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    update: vi.fn(),
    commit: vi.fn(),
  })),
}));

import { getDocs } from 'firebase/firestore';
import { searchProviders } from './firebookings';

const mockGetDocs = vi.mocked(getDocs);
beforeEach(() => vi.clearAllMocks());

describe('searchProviders activity exclusion', () => {
  it('omits verified docs that are VFun activities', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        { id: 'trainer-1', data: () => ({ fullName: 'Real Trainer', providerProfile: { isVerified: true } }) },
        { id: 'event-1', data: () => ({ fullName: 'Sunset Party', activityKind: 'event', providerProfile: { isVerified: true } }) },
      ],
    } as never);
    const results = await searchProviders({});
    expect(results.map((p) => p.id)).toEqual(['trainer-1']);
  });
});

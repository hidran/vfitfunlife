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

vi.mock('./firebase/availability', () => ({ fetchProviderSlots: vi.fn() }));

import { getDocs } from 'firebase/firestore';
import { fetchProviderSlots } from './firebase/availability';
import { getProviderAvailability, searchProviders } from './firebookings';

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

describe('getProviderAvailability', () => {
  it('asks the server for the picker day and returns only offered, bookable slots', async () => {
    vi.mocked(fetchProviderSlots).mockResolvedValueOnce([
      { time: '09:00', startsAt: '2026-09-21T07:00:00.000Z' },
      { time: '09:30', startsAt: '2026-09-21T07:30:00.000Z' },
    ]);
    // A picker cell is local midnight; the key must be that calendar day, not its UTC date.
    const slots = await getProviderAvailability('p1', 's1', new Date(2026, 8, 21));

    expect(fetchProviderSlots).toHaveBeenCalledWith({ instructorId: 'p1', serviceId: 's1', date: '2026-09-21' });
    expect(slots).toEqual([
      { time: '09:00', startsAt: '2026-09-21T07:00:00.000Z', isAvailable: true, isBooked: false },
      { time: '09:30', startsAt: '2026-09-21T07:30:00.000Z', isAvailable: true, isBooked: false },
    ]);
  });
});

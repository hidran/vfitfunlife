import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchVenue,
  fetchVenues,
  fetchVenueServices,
  fetchVenueCourses,
} from './venues';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn((..._args) => ({ __query: true })),
  where: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  Timestamp: { now: () => ({ seconds: 0, nanoseconds: 0 }) },
}));

import { getDoc, getDocs } from 'firebase/firestore';

const mockGetDoc = vi.mocked(getDoc);
const mockGetDocs = vi.mocked(getDocs);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchVenue', () => {
  it('returns null when document does not exist', async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => false } as never);
    const result = await fetchVenue('missing');
    expect(result).toBeNull();
  });

  it('returns venue with id injected when document exists', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      id: 'carosello',
      data: () => ({ name: 'Carosello Fitness', type: 'gym' }),
    } as never);
    const result = await fetchVenue('carosello');
    expect(result).toEqual({ id: 'carosello', name: 'Carosello Fitness', type: 'gym' });
  });
});

describe('fetchVenues', () => {
  it('returns array of venues from snapshot', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        { id: 'a', data: () => ({ name: 'A', type: 'gym' }) },
        { id: 'b', data: () => ({ name: 'B', type: 'gym' }) },
      ],
    } as never);
    const result = await fetchVenues({ type: 'gym' });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 'a', name: 'A', type: 'gym' });
  });

  it('returns empty array on error', async () => {
    mockGetDocs.mockRejectedValueOnce(new Error('network'));
    const result = await fetchVenues();
    expect(result).toEqual([]);
  });
});

describe('fetchVenueServices', () => {
  it('returns services from subcollection', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [{ id: 'svc-1', data: () => ({ name: 'Daily pass', price: 18, isActive: true }) }],
    } as never);
    const result = await fetchVenueServices('carosello');
    expect(result).toEqual([{ id: 'svc-1', name: 'Daily pass', price: 18, isActive: true }]);
  });
});

describe('fetchVenueCourses', () => {
  it('returns courses from subcollection', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [{ id: 'c-1', data: () => ({ name: 'HIIT', time: '07:30', coach: 'Marco', spots: 3 }) }],
    } as never);
    const result = await fetchVenueCourses('carosello');
    expect(result).toEqual([{ id: 'c-1', name: 'HIIT', time: '07:30', coach: 'Marco', spots: 3 }]);
  });
});

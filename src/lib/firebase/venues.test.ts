import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchVenue,
  fetchVenues,
  fetchVenueServices,
  fetchManagedVenues,
  fetchVenuesNear,
  typeFilter,
} from './venues';

vi.mock('./config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn((..._args) => ({ __query: true })),
  where: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn((field, dir) => ({ orderBy: [field, dir] })),
  startAt: vi.fn(),
  endAt: vi.fn(),
  Timestamp: { now: () => ({ seconds: 0, nanoseconds: 0 }) },
}));

import { getDoc, getDocs, orderBy, limit, where } from 'firebase/firestore';

const mockGetDoc = vi.mocked(getDoc);
const mockGetDocs = vi.mocked(getDocs);

beforeEach(() => {
  vi.resetAllMocks();
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

  it('bounded top-rated list: orders by rating desc and applies the limit', async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [] } as never);
    await fetchVenues({ type: 'gym', orderByRating: true, limit: 50 });
    expect(orderBy).toHaveBeenCalledWith('rating', 'desc');
    expect(limit).toHaveBeenCalledWith(50);
  });
});

describe('type filters', () => {
  it("fetchVenues filters with 'in' for a list of types, ordered by rating (same (type, rating) index)", async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [] } as never);
    await fetchVenues({ types: ['gym', 'school', 'studio'], orderByRating: true, limit: 50 });
    expect(where).toHaveBeenCalledWith('type', 'in', ['gym', 'school', 'studio']);
    expect(where).not.toHaveBeenCalledWith('type', '==', expect.anything());
    expect(orderBy).toHaveBeenCalledWith('rating', 'desc');
  });

  it("fetchVenues keeps '==' for a single type and no filter without one", async () => {
    mockGetDocs.mockResolvedValue({ docs: [] } as never);
    await fetchVenues({ type: 'gym' });
    expect(where).toHaveBeenCalledWith('type', '==', 'gym');
    vi.mocked(where).mockClear();
    await fetchVenues();
    expect(where).not.toHaveBeenCalled();
  });

  it('types takes precedence over type', async () => {
    mockGetDocs.mockResolvedValue({ docs: [] } as never);
    await fetchVenues({ type: 'spa', types: ['gym', 'school'] });
    expect(where).toHaveBeenCalledWith('type', 'in', ['gym', 'school']);
    expect(where).not.toHaveBeenCalledWith('type', '==', 'spa');
  });

  it('an empty types list matches nothing instead of reading every venue', async () => {
    expect(typeFilter({ types: [] })).toBeNull();
    expect(typeFilter({ type: 'gym', types: [] })).toBeNull();
    expect(await fetchVenues({ types: [] })).toEqual([]);
    expect(await fetchVenuesNear({ types: [], center: { lat: 41, lng: 16 }, radiusKm: 5 })).toEqual([]);
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it("fetchVenuesNear combines 'in' with the geohash range", async () => {
    mockGetDocs.mockResolvedValue({ docs: [] } as never);
    await fetchVenuesNear({ types: ['gym', 'school'], center: { lat: 41.1171, lng: 16.8719 }, radiusKm: 10 });
    expect(where).toHaveBeenCalledWith('type', 'in', ['gym', 'school']);
    expect(orderBy).toHaveBeenCalledWith('geohash');
  });
});

describe('fetchVenuesNear', () => {
  it('returns only active venues inside the radius, nearest-first with distanceKm', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        { id: 'bari-far', data: () => ({ name: 'Far', type: 'gym', lat: 41.2, lng: 16.9, isActive: true }) },
        { id: 'bari-near', data: () => ({ name: 'Near', type: 'gym', lat: 41.12, lng: 16.875, isActive: true }) },
        { id: 'bari-off', data: () => ({ name: 'Off', type: 'gym', lat: 41.118, lng: 16.872, isActive: false }) },
        { id: 'napoli', data: () => ({ name: 'Napoli', type: 'gym', lat: 40.85, lng: 14.27, isActive: true }) },
      ],
    } as never);
    const out = await fetchVenuesNear({ type: 'gym', center: { lat: 41.1171, lng: 16.8719 }, radiusKm: 25 });
    expect(out.map((v) => v.id)).toEqual(['bari-near', 'bari-far']);
    expect(out[0].distanceKm).toBeLessThan(1);
  });

  it('returns empty array on error (e.g. missing index)', async () => {
    mockGetDocs.mockRejectedValue(new Error('FAILED_PRECONDITION'));
    const out = await fetchVenuesNear({ center: { lat: 41, lng: 16 }, radiusKm: 5 });
    expect(out).toEqual([]);
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

describe('fetchManagedVenues', () => {
  const owned = { id: 'biz_u1', data: () => ({ name: 'Own', type: 'studio', isActive: true, ownerId: 'u1' }) };

  it('returns the owned venues plus the venue of an active staff link, once each', async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [owned] } as never);
    mockGetDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ venueId: 'v2', isActive: true }) } as never)
      .mockResolvedValueOnce({ exists: () => true, id: 'v2', data: () => ({ name: 'Staffed', type: 'gym', isActive: true }) } as never);
    const venues = await fetchManagedVenues('u1');
    expect(venues.map(v => v.id)).toEqual(['biz_u1', 'v2']);
  });

  it('does not list the same venue twice when the owner is also its staff', async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [owned] } as never);
    mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ venueId: 'biz_u1' }) } as never);
    expect((await fetchManagedVenues('u1')).map(v => v.id)).toEqual(['biz_u1']);
    expect(mockGetDoc).toHaveBeenCalledTimes(1);
  });

  it('ignores an inactive staff link and deactivated venues', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [{ id: 'off', data: () => ({ name: 'Off', type: 'gym', isActive: false }) }, owned],
    } as never);
    mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ venueId: 'v2', isActive: false }) } as never);
    expect((await fetchManagedVenues('u1')).map(v => v.id)).toEqual(['biz_u1']);
  });

  it('returns an empty list for a user with neither', async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [] } as never);
    mockGetDoc.mockResolvedValueOnce({ exists: () => false } as never);
    expect(await fetchManagedVenues('u1')).toEqual([]);
  });

  it('queries owned venues by ownerId', async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [] } as never);
    mockGetDoc.mockResolvedValueOnce({ exists: () => false } as never);
    await fetchManagedVenues('u1');
    expect(vi.mocked(where)).toHaveBeenCalledWith('ownerId', '==', 'u1');
  });
});

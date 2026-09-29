import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ col, id })),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'TS'),
}));

import { getDoc, updateDoc } from 'firebase/firestore';
import { fetchMyLocation, saveMyLocation } from './providerLocation';

beforeEach(() => vi.clearAllMocks());

describe('fetchMyLocation', () => {
  it('returns null when the caller has no instructor profile', async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
    await expect(fetchMyLocation('u1')).resolves.toBeNull();
  });

  it('returns the saved coordinates and city from instructors/{uid}', async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ lat: 41.9, lng: 12.5, city: 'Roma' }),
    } as never);
    await expect(fetchMyLocation('u1')).resolves.toEqual({ coords: { lat: 41.9, lng: 12.5 }, city: 'Roma' });
    expect(vi.mocked(getDoc).mock.calls[0][0]).toEqual({ col: 'instructors', id: 'u1' });
  });
});

describe('saveMyLocation', () => {
  it('writes lat/lng/geohash/city on the caller\'s own instructor doc, nothing else', async () => {
    await saveMyLocation('u1', { lat: 41.90278, lng: 12.49636, city: 'Roma' });
    const [ref, written] = vi.mocked(updateDoc).mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect(ref).toEqual({ col: 'instructors', id: 'u1' });
    expect(Object.keys(written).sort()).toEqual(
      ['city', 'geohash', 'lat', 'lng', 'location', 'locationUpdatedAt', 'updatedAt'].sort()
    );
    expect(written).toMatchObject({ lat: 41.903, lng: 12.496, city: 'Roma' });
  });
});

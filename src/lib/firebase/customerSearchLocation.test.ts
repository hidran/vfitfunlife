import { beforeEach, describe, expect, it, vi } from 'vitest';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { fetchCustomerSearchLocation, saveCustomerSearchLocation } from './customerSearchLocation';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join('/') })),
  getDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  updateDoc: vi.fn(),
}));
vi.mock('./config', () => ({ db: {} }));

function snapshot(data: Record<string, unknown> | null) {
  return { exists: () => data !== null, data: () => data } as never;
}

beforeEach(() => vi.clearAllMocks());

describe('customerSearchLocation', () => {
  it('reads saved coordinates from the signed-in user document', async () => {
    vi.mocked(getDoc).mockResolvedValue(snapshot({ searchLocation: { lat: 45.46, lng: 9.19, geohash: 'u0nd' } }));
    await expect(fetchCustomerSearchLocation('customer-1')).resolves.toEqual({
      coords: { lat: 45.46, lng: 9.19 },
      geohash: 'u0nd',
    });
    expect(doc).toHaveBeenCalledWith({}, 'users', 'customer-1');
  });

  it('returns null for absent or invalid saved coordinates', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(snapshot(null));
    await expect(fetchCustomerSearchLocation('customer-1')).resolves.toBeNull();
    vi.mocked(getDoc).mockResolvedValueOnce(snapshot({ searchLocation: { lat: 91, lng: 9 } }));
    await expect(fetchCustomerSearchLocation('customer-1')).resolves.toBeNull();
  });

  it('rounds coordinates before saving and stores the derived geohash', async () => {
    await saveCustomerSearchLocation('customer-1', { lat: 45.464123, lng: 9.189812 });
    const [, data] = vi.mocked(updateDoc).mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect(data).toMatchObject({
      searchLocation: {
        lat: 45.464,
        lng: 9.19,
        geohash: expect.any(String),
      },
      updatedAt: 'SERVER_TIMESTAMP',
    });
    expect(String((data.searchLocation as { geohash: string }).geohash)).toHaveLength(10);
  });

  it('rejects invalid coordinates without writing', async () => {
    await expect(saveCustomerSearchLocation('customer-1', { lat: Number.NaN, lng: 9 })).rejects.toThrow('invalid-location');
    expect(updateDoc).not.toHaveBeenCalled();
  });
});

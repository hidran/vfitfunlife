import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, path) => ({ path })),
  query: vi.fn((col, ...constraints) => ({ col, constraints })),
  where: vi.fn((field, op, value) => ({ where: [field, op, value] })),
  orderBy: vi.fn((field) => ({ orderBy: field })),
  startAt: vi.fn((v) => ({ startAt: v })),
  endAt: vi.fn((v) => ({ endAt: v })),
  limit: vi.fn((n) => ({ limit: n })),
  getDocs: vi.fn(),
}));

import { getDocs, where, startAt, limit } from 'firebase/firestore';
import { geoRangeQuery, GEO_RANGE_LIMIT } from './geoQuery';
import { coordsOf, geoQueryBounds } from '@/lib/geo';

const bari = { lat: 41.1171, lng: 16.8719 };
type Row = { id: string; lat?: number; lng?: number; isActive?: boolean };
const snap = (rows: Row[]) => ({ docs: rows.map((r) => ({ id: r.id, data: () => r })) });

beforeEach(() => vi.clearAllMocks());

describe('geoRangeQuery', () => {
  it('runs one bounded range query per geohash bound, with the equality filters in front', async () => {
    vi.mocked(getDocs).mockResolvedValue(snap([]) as never);
    const bounds = geoQueryBounds(bari, 25);

    await geoRangeQuery<Row>({
      collectionPath: 'venues',
      filters: [where('type', '==', 'gym')],
      center: bari,
      radiusKm: 25,
      fromDoc: (id, d) => ({ id, ...d }) as Row,
      getCoords: coordsOf,
    });

    expect(getDocs).toHaveBeenCalledTimes(bounds.length);
    expect(vi.mocked(startAt).mock.calls.map((c) => c[0])).toEqual(bounds.map(([s]) => s));
    expect(limit).toHaveBeenCalledWith(GEO_RANGE_LIMIT);
    const firstQuery = vi.mocked(getDocs).mock.calls[0][0] as unknown as { constraints: unknown[] };
    expect(firstQuery.constraints[0]).toEqual({ where: ['type', '==', 'gym'] });
    expect(firstQuery.constraints[1]).toEqual({ orderBy: 'geohash' });
  });

  it('merges pages: dedupes, drops fromDoc nulls and out-of-radius docs, sorts nearest-first', async () => {
    const near = { id: 'near', lat: 41.12, lng: 16.875 };
    const mid = { id: 'mid', lat: 41.2, lng: 16.9 };
    const napoli = { id: 'napoli', lat: 40.8518, lng: 14.2681 };
    const inactive = { id: 'off', lat: 41.118, lng: 16.872, isActive: false };
    vi.mocked(getDocs)
      .mockResolvedValueOnce(snap([mid, near, inactive]) as never)
      .mockResolvedValue(snap([near, napoli]) as never);

    const out = await geoRangeQuery<Row>({
      collectionPath: 'venues',
      center: bari,
      radiusKm: 25,
      fromDoc: (id, d) => (d.isActive === false ? null : ({ id, ...d } as Row)),
      getCoords: coordsOf,
    });

    expect(out.map((v) => v.id)).toEqual(['near', 'mid']);
    expect(out[0].distanceKm).toBeLessThan(1);
  });
});

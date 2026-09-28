import { describe, it, expect } from 'vitest';
import {
  haversineKm,
  annotateAndSortByDistance,
  filterByRadius,
  geohashFor,
  geoQueryBounds,
  mergeGeoResults,
  coordsOf,
  roundLocation,
} from './geo';

describe('haversineKm', () => {
  it('computes Milano↔Roma ≈ 477 km', () => {
    const milano = { lat: 45.4642, lng: 9.19 };
    const roma = { lat: 41.9028, lng: 12.4964 };
    const d = haversineKm(milano, roma);
    expect(d).toBeGreaterThan(450);
    expect(d).toBeLessThan(500);
  });
  it('is zero for identical points', () => {
    const p = { lat: 45, lng: 9 };
    expect(haversineKm(p, p)).toBeCloseTo(0, 5);
  });
});

describe('annotateAndSortByDistance', () => {
  const from = { lat: 45.4642, lng: 9.19 };
  it('sorts nearest-first and adds distanceKm', () => {
    const items = [
      { id: 'roma', lat: 41.9028, lng: 12.4964 },
      { id: 'milano2', lat: 45.47, lng: 9.2 },
    ];
    const out = annotateAndSortByDistance(items, from, (i) => ({ lat: i.lat, lng: i.lng }));
    expect(out[0].id).toBe('milano2');
    expect(out[1].id).toBe('roma');
    expect(out[0].distanceKm).toBeLessThan(out[1].distanceKm);
  });
  it('puts items with null coords last with Infinity', () => {
    const items = [
      { id: 'a', lat: null as number | null, lng: null as number | null },
      { id: 'b', lat: 45.47, lng: 9.2 },
    ];
    const out = annotateAndSortByDistance(items, from, (i) =>
      i.lat != null && i.lng != null ? { lat: i.lat, lng: i.lng } : null
    );
    expect(out[0].id).toBe('b');
    expect(out[1].id).toBe('a');
    expect(out[1].distanceKm).toBe(Infinity);
  });
});

describe('filterByRadius', () => {
  it('keeps in-radius, drops out-of-radius and Infinity', () => {
    const items = [
      { id: 'near', distanceKm: 3 },
      { id: 'far', distanceKm: 40 },
      { id: 'none', distanceKm: Infinity },
    ];
    const out = filterByRadius(items, 10);
    expect(out.map((i) => i.id)).toEqual(['near']);
  });
});

describe('geohash search helpers', () => {
  const bari = { lat: 41.1171, lng: 16.8719 };

  it('geohashFor writes precision 10, matching the functions trigger', () => {
    // Same value asserted in functions/src/geo/geohashPatch.test.ts (ngeohash).
    expect(geohashFor(bari)).toBe('sr7czvjsry');
  });

  it('geoQueryBounds covers every point inside the radius', () => {
    const bounds = geoQueryBounds(bari, 10);
    expect(bounds.length).toBeGreaterThan(0);
    expect(bounds.length).toBeLessThanOrEqual(9);
    // Points ~7 km away in each direction must fall in some [start, end] range.
    for (const p of [
      { lat: bari.lat + 0.06, lng: bari.lng },
      { lat: bari.lat - 0.06, lng: bari.lng },
      { lat: bari.lat, lng: bari.lng + 0.08 },
      { lat: bari.lat, lng: bari.lng - 0.08 },
    ]) {
      const h = geohashFor(p);
      expect(bounds.some(([s, e]) => h >= s && h <= e)).toBe(true);
    }
  });

  it('geoQueryBounds excludes a far city (Napoli is ~220 km from Bari)', () => {
    const h = geohashFor({ lat: 40.8518, lng: 14.2681 });
    expect(geoQueryBounds(bari, 25).some(([s, e]) => h >= s && h <= e)).toBe(false);
  });

  it('mergeGeoResults dedupes overlapping pages, drops box corners and no-coords, sorts nearest-first', () => {
    const near = { id: 'near', lat: 41.12, lng: 16.875 };
    const mid = { id: 'mid', lat: 41.16, lng: 16.87 };
    const corner = { id: 'corner', lat: 41.2, lng: 16.99 }; // in the box, ~13 km: outside 10
    const noCoords = { id: 'none' } as { id: string; lat?: number; lng?: number };
    const out = mergeGeoResults<{ id: string; lat?: number; lng?: number }>(
      [[mid, near], [near, corner], [noCoords]],
      bari,
      10,
      coordsOf
    );
    expect(out.map((i) => i.id)).toEqual(['near', 'mid']);
    expect(out[0].distanceKm).toBeLessThan(out[1].distanceKm);
  });

  it('coordsOf only trusts finite numeric flat lat/lng', () => {
    expect(coordsOf({ lat: 1, lng: 2 })).toEqual({ lat: 1, lng: 2 });
    expect(coordsOf({ lat: '1', lng: 2 })).toBeNull();
    expect(coordsOf({ lat: NaN, lng: 2 })).toBeNull();
    expect(coordsOf({})).toBeNull();
  });

  it('roundLocation keeps cache keys stable under GPS jitter', () => {
    expect(roundLocation({ lat: 41.11712, lng: 16.87194 })).toEqual(
      roundLocation({ lat: 41.11708, lng: 16.8719 })
    );
  });
});

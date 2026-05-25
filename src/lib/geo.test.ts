import { describe, it, expect } from 'vitest';
import { haversineKm, annotateAndSortByDistance, filterByRadius } from './geo';

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

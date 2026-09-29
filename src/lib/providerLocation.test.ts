import { describe, it, expect } from 'vitest';
import { geohashForLocation } from 'geofire-common';
import {
  buildLocationPatch,
  cityFromAddressComponents,
  isValidLatLng,
  myLocationFromDoc,
  needsLocation,
} from './providerLocation';

describe('myLocationFromDoc / needsLocation', () => {
  it('reads the flat lat/lng pair near-me search uses, and the city', () => {
    const loc = myLocationFromDoc({ lat: 45.46, lng: 9.19, city: 'Milano' });
    expect(loc).toEqual({ coords: { lat: 45.46, lng: 9.19 }, city: 'Milano' });
    expect(needsLocation(loc)).toBe(false);
  });

  it('flags a profile without coordinates', () => {
    expect(needsLocation(myLocationFromDoc({ city: 'Bari' }))).toBe(true);
    expect(needsLocation(myLocationFromDoc({ lat: '45', lng: 9 }))).toBe(true);
    expect(needsLocation(myLocationFromDoc({ lat: 0, lng: 0 }))).toBe(true);
  });

  it('does not nag someone with no instructor profile at all (or while loading)', () => {
    expect(needsLocation(null)).toBe(false);
    expect(needsLocation(undefined)).toBe(false);
  });
});

describe('isValidLatLng', () => {
  it('rejects out-of-range, non-finite and (0, 0) points', () => {
    expect(isValidLatLng({ lat: 41.9, lng: 12.5 })).toBe(true);
    expect(isValidLatLng({ lat: 91, lng: 0 })).toBe(false);
    expect(isValidLatLng({ lat: 0, lng: 181 })).toBe(false);
    expect(isValidLatLng({ lat: NaN, lng: 1 })).toBe(false);
    expect(isValidLatLng({ lat: 0, lng: 0 })).toBe(false);
    expect(isValidLatLng(null)).toBe(false);
  });
});

describe('buildLocationPatch', () => {
  it('rounds to ~110 m and writes the geohash the server trigger would compute', () => {
    const patch = buildLocationPatch({ lat: 45.464211, lng: 9.190034, city: '  Milano ' });
    expect(patch).toEqual({
      lat: 45.464,
      lng: 9.19,
      geohash: geohashForLocation([45.464, 9.19], 10),
      city: 'Milano',
      location: 'Milano',
    });
  });

  it('refuses invalid coordinates and a blank city', () => {
    expect(() => buildLocationPatch({ lat: 0, lng: 0, city: 'X' })).toThrow('invalid-coordinates');
    expect(() => buildLocationPatch({ lat: 45, lng: 9, city: '  ' })).toThrow('city-required');
  });
});

describe('cityFromAddressComponents', () => {
  it('prefers the locality, then postal town, comune, province', () => {
    expect(
      cityFromAddressComponents([
        { long_name: 'Lombardia', types: ['administrative_area_level_1'] },
        { long_name: 'Milano', types: ['locality', 'political'] },
      ])
    ).toBe('Milano');
    expect(
      cityFromAddressComponents([
        { long_name: 'Città Metropolitana di Bari', types: ['administrative_area_level_2'] },
        { long_name: 'Monopoli', types: ['administrative_area_level_3'] },
      ])
    ).toBe('Monopoli');
    expect(cityFromAddressComponents([])).toBe('');
    expect(cityFromAddressComponents(undefined)).toBe('');
  });
});

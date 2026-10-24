import { describe, expect, it } from 'vitest';
import { toSlug, venueSlug } from './slug';

describe('toSlug', () => {
  it('lower-cases, strips accents and joins runs of other characters with one dash', () => {
    expect(toSlug('Palestra  Città  Studi — Torino!')).toBe('palestra-citta-studi-torino');
  });

  it('maps the letters NFD does not decompose instead of dropping them', () => {
    expect(toSlug('Straße Øst Ærø Łódź')).toBe('strasse-ost-aero-lodz');
  });

  it('trims leading and trailing dashes', () => {
    expect(toSlug('--Spa--')).toBe('spa');
  });
});

describe('venueSlug', () => {
  it('appends the city so same-named venues in different cities differ', () => {
    expect(venueSlug('Palestra Rossi', 'Torino')).toBe('palestra-rossi-torino');
    expect(venueSlug('Palestra Rossi', 'Milano')).toBe('palestra-rossi-milano');
  });

  it('slugs the name alone without a city and never returns an empty slug', () => {
    expect(venueSlug('Palestra Rossi', '')).toBe('palestra-rossi');
    expect(venueSlug('***', '')).toBe('venue');
  });
});

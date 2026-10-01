import { describe, expect, it } from 'vitest';
import { euroSymbolPosition, formatDecimal, formatDistance, formatPrice } from './utils';

// Intl puts a (narrow) no-break space before the euro sign in it/fr/de/es; normalise it.
const plain = (s: string) => s.replace(/[  ]/g, ' ');

describe('formatPrice', () => {
  it('follows the given app locale', () => {
    expect(plain(formatPrice(50, 'it'))).toBe('50,00 €');
    expect(plain(formatPrice(1234.5, 'de'))).toBe('1.234,50 €');
    expect(formatPrice(50, 'en')).toBe('€50.00');
  });
});

describe('formatDistance', () => {
  it('uses one decimal with the locale separator', () => {
    expect(formatDistance(0.1, 'it')).toBe('0,1 km');
    expect(formatDistance(0.1, 'en')).toBe('0.1 km');
    expect(formatDistance(12.34, 'de')).toBe('12,3 km');
  });
});

describe('formatDecimal', () => {
  it('pads to the given decimals in the locale', () => {
    expect(formatDecimal(0, 'it', 2)).toBe('0,00');
    expect(formatDecimal(0, 'en', 2)).toBe('0.00');
  });
});

describe('euroSymbolPosition', () => {
  it('puts the euro sign before in en and after in the other locales', () => {
    expect(euroSymbolPosition('en')).toBe('before');
    expect(euroSymbolPosition('it')).toBe('after');
    expect(euroSymbolPosition('es')).toBe('after');
    expect(euroSymbolPosition('fr')).toBe('after');
    expect(euroSymbolPosition('de')).toBe('after');
  });
});

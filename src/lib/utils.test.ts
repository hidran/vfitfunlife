import { describe, expect, it } from 'vitest';
import { formatPrice } from './utils';

// Intl puts a (narrow) no-break space before the euro sign in it/fr/de/es; normalise it.
const plain = (s: string) => s.replace(/[  ]/g, ' ');

describe('formatPrice', () => {
  it('defaults to Italian formatting', () => {
    expect(plain(formatPrice(50))).toBe('50,00 €');
  });

  it('follows the given app locale', () => {
    expect(plain(formatPrice(50, 'it'))).toBe('50,00 €');
    expect(plain(formatPrice(1234.5, 'de'))).toBe('1.234,50 €');
    expect(formatPrice(50, 'en')).toBe('€50.00');
  });
});

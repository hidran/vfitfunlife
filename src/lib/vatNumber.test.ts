import { describe, it, expect } from 'vitest';
import { isValidItalianVat, normalizeVatNumber } from './vatNumber';

// Keep this fixture list identical to functions/src/providers/vatNumber.test.ts (the two trees share no package).
const FIXTURES: ReadonlyArray<{ input: string; valid: boolean; label: string }> = [
  { input: '01234567897', valid: true, label: 'valid number' },
  { input: '12345678903', valid: true, label: 'valid number (second)' },
  { input: '50500000000', valid: true, label: 'check digit 0' },
  { input: 'IT01234567897', valid: true, label: 'IT prefix' },
  { input: 'it01234567897', valid: true, label: 'lowercase it prefix' },
  { input: '  IT 0123 4567 897  ', valid: true, label: 'prefix, inner and surrounding whitespace' },
  { input: '  12345678903', valid: true, label: 'leading whitespace' },
  { input: '01234567898', valid: false, label: 'bad check digit' },
  { input: '12345678900', valid: false, label: 'bad check digit (second)' },
  { input: '0123456789', valid: false, label: 'too short (10 digits)' },
  { input: '012345678970', valid: false, label: 'too long (12 digits)' },
  { input: '0123456789A', valid: false, label: 'non-digit character' },
  { input: '0123-4567-897', valid: false, label: 'punctuation' },
  { input: 'ITIT01234567897', valid: false, label: 'double prefix' },
  { input: 'DE01234567897', valid: false, label: 'foreign prefix' },
  { input: '00000000000', valid: false, label: 'all zeros (passes checksum, still invalid)' },
  { input: '', valid: false, label: 'empty string' },
];

describe('isValidItalianVat', () => {
  it.each(FIXTURES)("$label: '$input'", ({ input, valid }) => {
    expect(isValidItalianVat(input)).toBe(valid);
  });
});

describe('normalizeVatNumber', () => {
  it('strips whitespace and the IT prefix, leaving the bare 11 digits', () => {
    expect(normalizeVatNumber('  IT 0123 4567 897 ')).toBe('01234567897');
    expect(normalizeVatNumber('it12345678903')).toBe('12345678903');
  });

  it('returns an already-bare number unchanged', () => {
    expect(normalizeVatNumber('01234567897')).toBe('01234567897');
  });

  it('returns the stripped input when it is not a well-formed number', () => {
    expect(normalizeVatNumber(' 0123 ')).toBe('0123');
    expect(normalizeVatNumber('IT 12A')).toBe('12A');
  });
});

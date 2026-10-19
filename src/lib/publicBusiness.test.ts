import { describe, it, expect } from 'vitest';
import { readBusinessDetails, toPublicBusiness, safeHttpUrl } from './publicBusiness';

const valid = {
  legalName: 'Palestra Srl',
  vatNumber: '12345678903',
  displayName: ' Palestra Roma ',
  description: 'Fitness',
  website: 'https://palestra.it',
  logoUrl: 'https://cdn.x/logo.png',
  city: 'Roma',
  legalForm: 'association',
  affiliationNumber: 'CONI-1',
};

describe('safeHttpUrl', () => {
  it('accepts only http(s) URLs', () => {
    expect(safeHttpUrl('https://a.it/x')).toBe('https://a.it/x');
    expect(safeHttpUrl('http://a.it')).toBe('http://a.it');
    expect(safeHttpUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeHttpUrl('data:text/html,x')).toBeUndefined();
    expect(safeHttpUrl('not a url')).toBeUndefined();
    expect(safeHttpUrl(42)).toBeUndefined();
    expect(safeHttpUrl(null)).toBeUndefined();
  });
});

describe('readBusinessDetails', () => {
  it('returns undefined for anything that is not a plain object with a public name', () => {
    for (const bad of [undefined, null, 'x', 5, [], [valid], {}, { displayName: '  ' }, { displayName: 3 }]) {
      expect(readBusinessDetails(bad)).toBeUndefined();
    }
  });

  it('cleans a valid map', () => {
    expect(readBusinessDetails(valid)).toEqual({
      legalName: 'Palestra Srl',
      vatNumber: '12345678903',
      displayName: 'Palestra Roma',
      description: 'Fitness',
      website: 'https://palestra.it',
      logoUrl: 'https://cdn.x/logo.png',
      city: 'Roma',
      legalForm: 'association',
      affiliationNumber: 'CONI-1',
    });
  });

  it('coerces wrong types and drops unsafe URLs without adding undefined keys', () => {
    const out = readBusinessDetails({
      displayName: 'Acme',
      legalName: 7,
      vatNumber: null,
      description: {},
      website: 'javascript:alert(1)',
      logoUrl: 'ftp://x/y.png',
      city: 3,
      legalForm: 'galaxy',
    })!;
    expect(out).toEqual({ displayName: 'Acme', legalName: '', vatNumber: '' });
    expect(Object.keys(out).sort()).toEqual(['displayName', 'legalName', 'vatNumber']);
  });
});

describe('toPublicBusiness', () => {
  it('never carries the legal name, tax id or registration number', () => {
    const pub = toPublicBusiness(readBusinessDetails(valid));
    expect(pub).toEqual({
      displayName: 'Palestra Roma',
      description: 'Fitness',
      website: 'https://palestra.it',
      logoUrl: 'https://cdn.x/logo.png',
      city: 'Roma',
    });
    expect(toPublicBusiness(undefined)).toBeUndefined();
  });
});

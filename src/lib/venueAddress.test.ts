import { describe, it, expect } from 'vitest';
import { venueAddressText, venueLocationFields } from './venueAddress';

describe('venueAddressText', () => {
  it('returns a string address as stored', () => {
    expect(venueAddressText({ address: 'Via Roma 1, Milano' })).toBe('Via Roma 1, Milano');
  });

  it('joins a legacy object: street, then "zip city"', () => {
    expect(
      venueAddressText({ address: { street: 'Via Po 2', city: 'Torino', zipCode: '10100', country: 'IT' } }),
    ).toBe('Via Po 2, 10100 Torino');
  });

  it('copes with a partial legacy object', () => {
    expect(venueAddressText({ address: { street: 'Via Po 2' } })).toBe('Via Po 2');
    expect(venueAddressText({ address: { street: 'Via Po 2', city: 'Torino' } })).toBe('Via Po 2, Torino');
    expect(venueAddressText({ address: { city: 'Torino', zipCode: '' } })).toBe('Torino');
  });

  it('never returns an object, whatever is stored', () => {
    expect(venueAddressText({ address: {} })).toBe('');
    expect(venueAddressText({ address: null })).toBe('');
    expect(venueAddressText({ address: 42 })).toBe('');
    expect(venueAddressText({})).toBe('');
    expect(venueAddressText(null)).toBe('');
    expect(venueAddressText(undefined)).toBe('');
  });
});

describe('venueLocationFields', () => {
  it('writes a string address plus top-level city, zipCode and country', () => {
    const out = venueLocationFields({ street: ' Via Po 2 ', city: 'Torino ', zipCode: '10100', country: 'IT' });
    expect(out).toEqual({ address: 'Via Po 2', city: 'Torino', zipCode: '10100', country: 'IT' });
    expect(typeof out.address).toBe('string');
  });
});

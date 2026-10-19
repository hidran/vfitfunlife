import { describe, it, expect } from 'vitest';
import {
  EMPTY_BUSINESS_DETAILS,
  firstBusinessError,
  providerApplicationErrorFor,
  toBusinessApplicationInput,
  validateBusinessDetails,
  type BusinessDetailsValues,
} from './businessDetails';

const valid: BusinessDetailsValues = {
  legalName: 'Palestra Rossi S.r.l.',
  vatNumber: '01234567897',
  displayName: 'Palestra Rossi',
  venueType: 'gym',
  address: 'Via Roma 1',
  city: 'Milano',
  website: '',
};

describe('validateBusinessDetails', () => {
  it('accepts a complete company', () => {
    expect(validateBusinessDetails(valid)).toEqual({});
  });

  it('requires legal name, P.IVA, public name, address and city for a gym', () => {
    expect(validateBusinessDetails(EMPTY_BUSINESS_DETAILS)).toEqual({
      legalName: 'provider.business.error.legalNameRequired',
      vatNumber: 'provider.business.error.vatRequired',
      displayName: 'provider.business.error.displayNameRequired',
      address: 'provider.business.error.addressRequired',
      city: 'provider.business.error.cityRequired',
    });
  });

  it('rejects a P.IVA with a bad check digit', () => {
    expect(validateBusinessDetails({ ...valid, vatNumber: '01234567898' })).toEqual({
      vatNumber: 'provider.business.error.vatInvalid',
    });
  });

  it('accepts a P.IVA typed with spaces and an IT prefix', () => {
    expect(validateBusinessDetails({ ...valid, vatNumber: 'IT 01234 567 897' })).toEqual({});
  });

  it('rejects a website that is not an http(s) URL', () => {
    expect(validateBusinessDetails({ ...valid, website: 'palestrarossi.it' })).toEqual({
      website: 'provider.business.error.websiteInvalid',
    });
    expect(validateBusinessDetails({ ...valid, website: 'ftp://palestrarossi.it' })).toEqual({
      website: 'provider.business.error.websiteInvalid',
    });
    expect(validateBusinessDetails({ ...valid, website: 'https://palestrarossi.it' })).toEqual({});
  });

  it('does not require address or city when there are no fixed premises', () => {
    expect(validateBusinessDetails({ ...valid, venueType: 'none', address: '', city: '' })).toEqual({});
  });

  it('caps field lengths like the server', () => {
    expect(validateBusinessDetails({ ...valid, legalName: 'x'.repeat(121) })).toEqual({
      legalName: 'provider.business.error.tooLong',
    });
  });
});

describe('firstBusinessError', () => {
  it('returns the first field in screen order', () => {
    expect(firstBusinessError({ city: 'provider.business.error.cityRequired', vatNumber: 'provider.business.error.vatInvalid' }))
      .toBe('vatNumber');
    expect(firstBusinessError({})).toBeNull();
  });
});

describe('toBusinessApplicationInput', () => {
  it('normalises the P.IVA, trims text and drops empty optionals', () => {
    expect(toBusinessApplicationInput({ ...valid, vatNumber: ' IT01234567897 ', legalName: ' Palestra Rossi S.r.l. ' })).toEqual({
      legalName: 'Palestra Rossi S.r.l.',
      vatNumber: '01234567897',
      displayName: 'Palestra Rossi',
      venueType: 'gym',
      address: 'Via Roma 1',
      city: 'Milano',
    });
  });

  it('falls back to the legal name as public name and omits premises for venueType none', () => {
    expect(toBusinessApplicationInput({ ...valid, displayName: '', venueType: 'none', website: 'https://x.it' })).toEqual({
      legalName: 'Palestra Rossi S.r.l.',
      vatNumber: '01234567897',
      displayName: 'Palestra Rossi S.r.l.',
      venueType: 'none',
      website: 'https://x.it',
    });
  });
});

describe('providerApplicationErrorFor', () => {
  it('maps the server codes to messages and the field they belong to', () => {
    expect(providerApplicationErrorFor({ code: 'functions/already-exists', message: 'business_vat_taken' }))
      .toEqual({ key: 'provider.business.error.vatTaken', field: 'vatNumber' });
    expect(providerApplicationErrorFor({ code: 'functions/invalid-argument', message: 'business_vat_invalid' }))
      .toEqual({ key: 'provider.business.error.vatInvalid', field: 'vatNumber' });
    expect(providerApplicationErrorFor({ code: 'functions/failed-precondition', message: 'provider_type_locked' }))
      .toEqual({ key: 'provider.business.error.typeLocked', field: null });
    expect(providerApplicationErrorFor({ code: 'functions/permission-denied', message: 'nope' }))
      .toEqual({ key: 'auth.register.error.providerNotAllowed', field: null });
    expect(providerApplicationErrorFor(new Error('boom')))
      .toEqual({ key: 'provider.card.error', field: null });
  });
});

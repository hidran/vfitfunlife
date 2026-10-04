import { describe, it, expect } from 'vitest';
import {
  BUSINESS_FIELD_LIMITS,
  BUSINESS_FORM_ERRORS,
  BUSINESS_LEGAL_FORMS,
  EMPTY_BUSINESS_DETAILS,
  businessDetailsSchema,
  normalizeWebsite,
  type BusinessDetailsFormValues,
  type BusinessField,
} from './businessDetails';

const VALID: BusinessDetailsFormValues = {
  ...EMPTY_BUSINESS_DETAILS,
  legalName: 'Karate Club Roma SRL',
  vatNumber: '00743110157',
};

/** The messages the schema reports for `field`, given `values` on top of a valid form. */
function messagesFor(field: BusinessField, overrides: Partial<BusinessDetailsFormValues>): string[] {
  const result = businessDetailsSchema.safeParse({ ...VALID, ...overrides });
  if (result.success) return [];
  return result.error.issues.filter((issue) => issue.path[0] === field).map((issue) => issue.message);
}

describe('normalizeWebsite', () => {
  it('returns "" for an empty or blank address', () => {
    expect(normalizeWebsite('')).toBe('');
    expect(normalizeWebsite('   ')).toBe('');
  });

  it('adds https:// to a bare address, www. or not', () => {
    expect(normalizeWebsite('www.karateroma.it')).toBe('https://www.karateroma.it');
    expect(normalizeWebsite('  karateroma.it/corsi  ')).toBe('https://karateroma.it/corsi');
  });

  it('keeps http and https, lower-casing the scheme only', () => {
    expect(normalizeWebsite('http://karateroma.it')).toBe('http://karateroma.it');
    expect(normalizeWebsite('HTTPS://KarateRoma.it/Corsi')).toBe('https://KarateRoma.it/Corsi');
    expect(normalizeWebsite('Http://karateroma.it')).toBe('http://karateroma.it');
  });

  it('treats host:port as a host, not as a scheme', () => {
    expect(normalizeWebsite('karateroma.it:8080')).toBe('https://karateroma.it:8080');
    expect(normalizeWebsite('https://karateroma.it:8443/x')).toBe('https://karateroma.it:8443/x');
    // A port does not make a dot-less host acceptable.
    expect(normalizeWebsite('localhost:3000')).toBeNull();
  });

  it('refuses credentials in the address', () => {
    expect(normalizeWebsite('https://user:secret@karateroma.it')).toBeNull();
    expect(normalizeWebsite('user@karateroma.it')).toBeNull();
    expect(normalizeWebsite('http://user@karateroma.it')).toBeNull();
  });

  it('refuses other schemes and things that are not addresses', () => {
    for (const input of [
      'javascript:alert(1)',
      'mailto:info@karateroma.it',
      'ftp://karateroma.it',
      'data:text/html,hi',
      'karate roma.it',
      'localhost',
      'https://',
    ]) {
      expect(normalizeWebsite(input), input).toBeNull();
    }
  });

  it('checks the format only — the length cap is the schema’s, counting the added https://', () => {
    const bare = `${'a'.repeat(190)}.it`; // 193 characters
    expect(normalizeWebsite(bare)).toBe(`https://${bare}`);
    expect(normalizeWebsite(bare)).toHaveLength(201);
  });
});

describe('businessDetailsSchema limits', () => {
  it('accepts the minimal valid form', () => {
    expect(businessDetailsSchema.safeParse(VALID).success).toBe(true);
  });

  it.each([
    ['legalName', BUSINESS_FIELD_LIMITS.legalName, BUSINESS_FORM_ERRORS.nameInvalid],
    ['displayName', BUSINESS_FIELD_LIMITS.displayName, BUSINESS_FORM_ERRORS.nameInvalid],
    ['description', BUSINESS_FIELD_LIMITS.description, BUSINESS_FORM_ERRORS.descriptionInvalid],
    ['city', BUSINESS_FIELD_LIMITS.city, BUSINESS_FORM_ERRORS.cityInvalid],
    ['affiliationNumber', BUSINESS_FIELD_LIMITS.affiliationNumber, BUSINESS_FORM_ERRORS.affiliationInvalid],
  ] as const)('%s: %i characters pass, one more fails', (field, max, message) => {
    expect(messagesFor(field, { [field]: 'x'.repeat(max) })).toEqual([]);
    // Surrounding spaces don't count: the server trims before measuring.
    expect(messagesFor(field, { [field]: `  ${'x'.repeat(max)}  ` })).toEqual([]);
    expect(messagesFor(field, { [field]: 'x'.repeat(max + 1) })).toEqual([message]);
  });

  it('caps the website at 200 characters after https:// is added, with its own message', () => {
    const fits = `${'a'.repeat(189)}.it`; // 192 + 8 = 200
    const tooLong = `${'a'.repeat(190)}.it`; // 193 + 8 = 201
    expect(messagesFor('website', { website: fits })).toEqual([]);
    expect(messagesFor('website', { website: tooLong })).toEqual([BUSINESS_FORM_ERRORS.websiteTooLong]);
    expect(messagesFor('website', { website: `https://${fits}` })).toEqual([]);
    expect(messagesFor('website', { website: `https://${tooLong}` })).toEqual([
      BUSINESS_FORM_ERRORS.websiteTooLong,
    ]);
  });

  it('reports a malformed website as invalid, never also as too long', () => {
    expect(messagesFor('website', { website: `javascript:${'a'.repeat(300)}` })).toEqual([
      BUSINESS_FORM_ERRORS.websiteInvalid,
    ]);
  });

  it('requires the legal name and the tax id', () => {
    expect(messagesFor('legalName', { legalName: '   ' })).toEqual([BUSINESS_FORM_ERRORS.legalNameRequired]);
    expect(messagesFor('vatNumber', { vatNumber: '' })).toEqual([BUSINESS_FORM_ERRORS.vatRequired]);
    expect(messagesFor('vatNumber', { vatNumber: '12345678904' })).toEqual([BUSINESS_FORM_ERRORS.vatInvalid]);
  });

  it('offers exactly the server’s legal forms, company first (the default)', () => {
    expect(BUSINESS_LEGAL_FORMS).toEqual(['company', 'sole_trader', 'association', 'other']);
    expect(EMPTY_BUSINESS_DETAILS.legalForm).toBe(BUSINESS_LEGAL_FORMS[0]);
    for (const legalForm of BUSINESS_LEGAL_FORMS) {
      expect(messagesFor('legalForm', { legalForm })).toEqual([]);
    }
    expect(
      messagesFor('legalForm', { legalForm: 'srl' as BusinessDetailsFormValues['legalForm'] })
    ).toEqual([BUSINESS_FORM_ERRORS.legalFormInvalid]);
  });
});

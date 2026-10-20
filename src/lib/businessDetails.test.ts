import { describe, it, expect } from 'vitest';
import {
  BUSINESS_DISPLAY_FIELDS,
  BUSINESS_FIELD_LIMITS,
  BUSINESS_FORM_ERRORS,
  BUSINESS_LEGAL_FORMS,
  BUSINESS_OWNER_EDITABLE_KEYS,
  BUSINESS_VENUE_TYPES,
  EMPTY_BUSINESS_DETAILS,
  VENUE_TYPE_LABEL,
  businessDetailsSchema,
  businessEditSchema,
  businessFormValues,
  isAcceptableLogoUrl,
  normalizeWebsite,
  toBusinessApplication,
  toBusinessDisplayFields,
  type BusinessDetailsFormValues,
  type BusinessField,
} from './businessDetails';

// A company with premises (the default venue type is a gym): address and city are required.
const VALID: BusinessDetailsFormValues = {
  ...EMPTY_BUSINESS_DETAILS,
  legalName: 'Karate Club Roma SRL',
  vatNumber: '00743110157',
  address: 'Via Roma 1',
  city: 'Roma',
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
    ['address', BUSINESS_FIELD_LIMITS.address, BUSINESS_FORM_ERRORS.addressInvalid],
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

describe('the premises of a company (B12: venueType, address, city)', () => {
  it('offers every venue type plus none, a gym first (the default)', () => {
    expect([...BUSINESS_VENUE_TYPES]).toEqual([
      'gym', 'wellness_center', 'spa', 'beauty_salon', 'school', 'studio', 'outdoor_space', 'event_space', 'none',
    ]);
    expect(EMPTY_BUSINESS_DETAILS.venueType).toBe('gym');
    expect(Object.keys(VENUE_TYPE_LABEL).sort()).toEqual([...BUSINESS_VENUE_TYPES].sort());
    for (const venueType of BUSINESS_VENUE_TYPES) expect(messagesFor('venueType', { venueType })).toEqual([]);
  });

  it('refuses an unknown or empty venue type when signing up', () => {
    for (const venueType of ['', 'pool', 'airport'] as const) {
      expect(messagesFor('venueType', { venueType: venueType as BusinessDetailsFormValues['venueType'] })).toEqual([
        BUSINESS_FORM_ERRORS.venueTypeInvalid,
      ]);
    }
  });

  it.each(['gym', 'wellness_center', 'spa', 'beauty_salon', 'school', 'studio', 'outdoor_space', 'event_space'] as const)(
    'requires an address and a city for a %s', (venueType) => {
    expect(messagesFor('address', { venueType, address: '   ' })).toEqual([BUSINESS_FORM_ERRORS.addressRequired]);
    expect(messagesFor('city', { venueType, city: '' })).toEqual([BUSINESS_FORM_ERRORS.cityRequired]);
  });

  it('asks for neither when the company has no fixed premises', () => {
    expect(messagesFor('address', { venueType: 'none', address: '' })).toEqual([]);
    expect(messagesFor('city', { venueType: 'none', city: '' })).toEqual([]);
    expect(businessDetailsSchema.safeParse({ ...VALID, venueType: 'none', address: '', city: '' }).success).toBe(true);
  });

  it('still caps a city and an address typed for a company without premises', () => {
    expect(messagesFor('city', { venueType: 'none', city: 'x'.repeat(81) })).toEqual([BUSINESS_FORM_ERRORS.cityInvalid]);
    expect(messagesFor('address', { venueType: 'none', address: 'x'.repeat(201) })).toEqual([
      BUSINESS_FORM_ERRORS.addressInvalid,
    ]);
  });

  it('reports the field errors and the missing premises together', () => {
    const result = businessDetailsSchema.safeParse({ ...VALID, legalName: '', address: '', city: '' });
    expect(result.success).toBe(false);
    const byField = (result.success ? [] : result.error.issues).map((i) => [i.path[0], i.message]);
    expect(byField).toEqual(
      expect.arrayContaining([
        ['legalName', BUSINESS_FORM_ERRORS.legalNameRequired],
        ['address', BUSINESS_FORM_ERRORS.addressRequired],
        ['city', BUSINESS_FORM_ERRORS.cityRequired],
      ])
    );
  });

  it('builds the application payload with the venue type, and the address only for premises', () => {
    expect(toBusinessApplication({ ...VALID, venueType: 'school', address: ' Via Roma 1 ' })).toMatchObject({
      venueType: 'school',
      address: 'Via Roma 1',
      city: 'Roma',
    });
    const none = toBusinessApplication({ ...VALID, venueType: 'none', address: 'Via Roma 1', city: '' });
    expect(none.venueType).toBe('none');
    expect(none).not.toHaveProperty('address');
    expect(none).not.toHaveProperty('city');
    // A city typed for a company without premises is still sent: it is optional there.
    expect(toBusinessApplication({ ...VALID, venueType: 'none' }).city).toBe('Roma');
  });

  it('defaults the venue type to a gym in the payload when the form carries none', () => {
    expect(toBusinessApplication({ ...VALID, venueType: '' }).venueType).toBe('gym');
  });
});

describe('company profile editing (B6)', () => {
  const STORED: BusinessDetailsFormValues = {
    ...EMPTY_BUSINESS_DETAILS,
    legalName: 'Karate Club Roma SRL',
    vatNumber: '00743110157',
    displayName: 'Karate Club Roma',
  };
  const editMessages = (field: BusinessField, overrides: Partial<BusinessDetailsFormValues>) => {
    const result = businessEditSchema.safeParse({ ...STORED, ...overrides });
    if (result.success) return [];
    return result.error.issues.filter((issue) => issue.path[0] === field).map((issue) => issue.message);
  };

  it('lets the owner edit exactly the display fields the Firestore rules allow', () => {
    expect([...BUSINESS_OWNER_EDITABLE_KEYS].sort()).toEqual(
      ['city', 'description', 'displayName', 'logoUrl', 'website'].sort()
    );
    for (const reviewed of [
      'legalName', 'vatNumber', 'legalForm', 'affiliationNumber', 'venueType', 'address', 'venueId',
    ]) {
      expect(BUSINESS_OWNER_EDITABLE_KEYS as readonly string[]).not.toContain(reviewed);
      expect(BUSINESS_DISPLAY_FIELDS as readonly string[]).not.toContain(reviewed);
    }
  });

  it('requires a non-blank public name, capped at 120', () => {
    expect(editMessages('displayName', { displayName: '   ' })).toEqual([BUSINESS_FORM_ERRORS.displayNameRequired]);
    expect(editMessages('displayName', { displayName: 'x'.repeat(120) })).toEqual([]);
    expect(editMessages('displayName', { displayName: 'x'.repeat(121) })).toEqual([BUSINESS_FORM_ERRORS.nameInvalid]);
  });

  it('does not validate the read-only reviewed fields (an older doc must stay editable)', () => {
    expect(businessEditSchema.safeParse({ ...STORED, legalName: '', vatNumber: '123', affiliationNumber: 'x'.repeat(80) }).success).toBe(true);
  });

  it('does not ask a stored company for the premises it signed up with (address and city stay optional)', () => {
    expect(businessEditSchema.safeParse({ ...STORED, venueType: 'gym', address: '', city: '' }).success).toBe(true);
    expect(businessEditSchema.safeParse({ ...STORED, venueType: '', address: '' }).success).toBe(true);
  });

  it('keeps the signup rules for city, website and description', () => {
    expect(editMessages('website', { website: 'javascript:alert(1)' })).toEqual([BUSINESS_FORM_ERRORS.websiteInvalid]);
    expect(editMessages('city', { city: 'x'.repeat(81) })).toEqual([BUSINESS_FORM_ERRORS.cityInvalid]);
    expect(editMessages('description', { description: 'x'.repeat(1001) })).toEqual([BUSINESS_FORM_ERRORS.descriptionInvalid]);
  });

  it('turns stored details into form values, an unknown legal form into company', () => {
    expect(
      businessFormValues({
        legalName: 'Karate Club Roma SRL',
        vatNumber: '00743110157',
        legalForm: 'srl' as never,
        displayName: 'Karate Club Roma',
        website: null,
        logoUrl: 'https://x.it/logo.png',
      })
    ).toEqual({ ...STORED, legalForm: 'company', venueType: '' });
    expect(
      businessFormValues({ legalName: 'A', vatNumber: '1', legalForm: 'association', displayName: 'A', city: 'Roma' })
    ).toMatchObject({ legalForm: 'association', city: 'Roma' });
  });

  it('shows the stored venue type and address read-only, and none when the company has no venue type', () => {
    const base = { legalName: 'A', vatNumber: '1', displayName: 'A' };
    expect(businessFormValues({ ...base, venueType: 'school', address: 'Via Roma 1' })).toMatchObject({
      venueType: 'school',
      address: 'Via Roma 1',
    });
    expect(businessFormValues({ ...base, venueType: 'none', address: null })).toMatchObject({
      venueType: 'none',
      address: '',
    });
    expect(businessFormValues(base)).toMatchObject({ venueType: '', address: '' });
    expect(businessFormValues({ ...base, venueType: 'pool' as never })).toMatchObject({ venueType: '' });
  });

  it('normalises display values the way they are stored', () => {
    expect(
      toBusinessDisplayFields({ displayName: ' Karate Roma ', city: ' Roma ', website: 'www.karateroma.it', description: ' Corsi ' })
    ).toEqual({ displayName: 'Karate Roma', city: 'Roma', website: 'https://www.karateroma.it', description: 'Corsi' });
    expect(toBusinessDisplayFields({ displayName: 'A', city: '', website: '  ', description: '' }).website).toBeNull();
  });

  it('accepts only https logo URLs of at most 500 characters, as the rules do', () => {
    expect(isAcceptableLogoUrl('https://firebasestorage.googleapis.com/v0/b/x/o/logo.jpg?alt=media')).toBe(true);
    expect(isAcceptableLogoUrl('http://127.0.0.1:9199/v0/b/x/o/logo.jpg')).toBe(false);
    expect(isAcceptableLogoUrl('data:image/png;base64,AAAA')).toBe(false);
    expect(isAcceptableLogoUrl('https://x.it/a b.png')).toBe(false);
    expect(isAcceptableLogoUrl(`https://x.it/${'a'.repeat(500 - 'https://x.it/'.length)}`)).toBe(true);
    expect(isAcceptableLogoUrl(`https://x.it/${'a'.repeat(501 - 'https://x.it/'.length)}`)).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { businessReviewOf, readAdminBusiness } from './providerBusiness';

const COMPANY = {
  legalName: 'Karate Club Milano S.r.l.',
  vatNumber: '12345678903',
  legalForm: 'association',
  affiliationNumber: 'CONI-123',
  displayName: 'Karate Club Milano',
  description: 'Corsi per tutte le età',
  website: 'https://karate.example.it/',
  logoUrl: 'https://cdn.example.it/logo.png',
  city: 'Milano',
  venueType: 'school',
  address: 'Via Po 2',
  venueId: 'biz_u1',
};

describe('readAdminBusiness', () => {
  it('reads every field an admin reviews, legal ones included', () => {
    expect(readAdminBusiness(COMPANY)).toEqual(COMPANY);
  });

  it('is null only when there is no map at all (an individual)', () => {
    for (const raw of [undefined, null, 'x', 42, false]) expect(readAdminBusiness(raw)).toBeNull();
  });

  it('treats any object as a company, like the server: a map without a public name still needs a review', () => {
    // Mirrors businessOf in functions/src/providers/businessAdminRules.ts.
    expect(readAdminBusiness({ vatNumber: '12345678903' })).toMatchObject({
      vatNumber: '12345678903',
      legalName: '',
      displayName: '',
    });
    expect(readAdminBusiness([])).not.toBeNull();
  });

  it('keeps the stored tax id and legal name exactly, so the review matches what is stored', () => {
    const b = readAdminBusiness({ ...COMPANY, legalName: ' Karate Club ', vatNumber: 'IT 12345678903' })!;
    expect(businessReviewOf(b)).toEqual({ vatNumber: 'IT 12345678903', legalName: ' Karate Club ', legalForm: 'association', affiliationNumber: 'CONI-123', venueType: 'school', address: 'Via Po 2' });
  });

  it('defaults an absent legal form to company (pre-B3b docs) and blanks an unknown one', () => {
    const { legalForm: _omit, ...withoutForm } = COMPANY;
    expect(readAdminBusiness(withoutForm)!.legalForm).toBe('company');
    expect(readAdminBusiness({ ...COMPANY, legalForm: 'gym' })!.legalForm).toBeNull();
  });

  it('reads the venue the approval creates: an absent type is not specified (null), the link is null before approval', () => {
    const { venueType: _t, venueId: _v, address: _a, ...bare } = COMPANY;
    expect(readAdminBusiness(bare)).toMatchObject({ venueType: null, address: '', venueId: null });
    expect(readAdminBusiness({ ...COMPANY, venueType: null })!.venueType).toBeNull();
    expect(readAdminBusiness({ ...COMPANY, venueType: 'pool' })!.venueType).toBeNull();
    expect(readAdminBusiness({ ...COMPANY, venueType: 'none' })!.venueType).toBe('none');
    // Not specified is not sent: the server reads an omitted type as 'none', exactly an absent one.
    expect(businessReviewOf(readAdminBusiness(bare)!)).not.toHaveProperty('venueType');
    expect(businessReviewOf(readAdminBusiness({ ...COMPANY, venueType: 'pool' })!)).not.toHaveProperty('venueType');
  });

  it('drops a website or logo that is not http(s), and coerces mistyped text to ""', () => {
    const b = readAdminBusiness({
      ...COMPANY,
      website: 'javascript:alert(1)',
      logoUrl: 'data:image/png;base64,xx',
      city: 7,
      description: null,
      affiliationNumber: undefined,
    })!;
    expect(b.website).toBeNull();
    expect(b.logoUrl).toBeNull();
    expect(b.city).toBe('');
    expect(b.description).toBe('');
    expect(b.affiliationNumber).toBe('');
  });
});

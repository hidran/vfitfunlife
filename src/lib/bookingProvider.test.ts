import { describe, expect, it } from 'vitest';
import { providerImageUrl, providerSearchResultFromProvider, publicBusiness } from './bookingProvider';
import type { Provider } from '@/types/instructor';

describe('providerImageUrl', () => {
  const business = { displayName: 'Rossi Gym', logoUrl: 'https://cdn/logo.png' };

  it("prefers a company's logo", () => {
    expect(providerImageUrl({ providerType: 'business', business, avatarUrl: 'https://cdn/a.png' })).toBe('https://cdn/logo.png');
  });

  it('falls back to the avatar for a business without a logo', () => {
    expect(providerImageUrl({ providerType: 'business', business: { logoUrl: null }, avatarUrl: 'https://cdn/a.png' })).toBe('https://cdn/a.png');
    expect(providerImageUrl({ providerType: 'business', business: null })).toBeUndefined();
  });

  it('ignores a stored logo when the provider is not a business', () => {
    expect(providerImageUrl({ business, avatarUrl: 'https://cdn/a.png' })).toBe('https://cdn/a.png');
    expect(providerImageUrl({ providerType: 'individual', business, avatarUrl: null })).toBeUndefined();
  });
});

describe('publicBusiness', () => {
  it('keeps only the public card fields', () => {
    expect(publicBusiness({ legalName: 'Rossi Fitness S.r.l.', vatNumber: '12345678901', displayName: 'Rossi Gym', logoUrl: 'x' }))
      .toEqual({ displayName: 'Rossi Gym', logoUrl: 'x' });
    expect(publicBusiness({ displayName: 'Rossi Gym' })).toEqual({ displayName: 'Rossi Gym', logoUrl: null });
    expect(publicBusiness(undefined)).toBeUndefined();
    expect(publicBusiness('nope')).toBeUndefined();
  });
});

describe('providerSearchResultFromProvider', () => {
  it('carries the provider type and public business fields', () => {
    const provider = {
      id: 'c1', fullName: 'Rossi Gym', rating: 0, reviewCount: 0, isVerified: true, specialties: [], yearsOfExperience: 0,
      languages: [], providerType: 'business',
      business: { legalName: 'Rossi Fitness S.r.l.', vatNumber: '12345678901', displayName: 'Rossi Gym', logoUrl: 'https://cdn/logo.png' },
    } as unknown as Provider;
    const result = providerSearchResultFromProvider(provider);
    expect(result.providerType).toBe('business');
    expect(result.business).toEqual({ displayName: 'Rossi Gym', logoUrl: 'https://cdn/logo.png' });
    expect(providerSearchResultFromProvider({ ...provider, providerType: undefined, business: undefined }).business).toBeUndefined();
  });
});

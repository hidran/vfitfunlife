import { describe, expect, it } from 'vitest';
import { providerSearchResultFromProvider } from './bookingProvider';
import type { Provider } from '@/types/instructor';

const base = {
  id: 'p1',
  fullName: 'Journey Fitness',
  avatarUrl: 'https://img.example/owner.jpg',
  rating: 4.5,
  reviewCount: 3,
  isVerified: true,
  yearsOfExperience: 2,
  languages: [],
  specialties: [],
} as unknown as Provider;

describe('providerSearchResultFromProvider', () => {
  it('carries a company\'s badge flag, public details and logo to the confirm page', () => {
    const result = providerSearchResultFromProvider({
      ...base,
      isBusiness: true,
      logoUrl: 'https://img.example/logo.png',
      business: { displayName: 'Journey' },
    });
    expect(result).toMatchObject({
      isBusiness: true,
      logoUrl: 'https://img.example/logo.png',
      business: { displayName: 'Journey' },
    });
  });

  it('adds none of the company keys for an individual', () => {
    const result = providerSearchResultFromProvider(base);
    expect(result).not.toHaveProperty('isBusiness');
    expect(result).not.toHaveProperty('business');
    expect(result).not.toHaveProperty('logoUrl');
  });
});

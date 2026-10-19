import type { Provider } from '@/types/instructor';
import type { ProviderSearchResult } from '@/types/booking';
import type { BusinessDetails, ProviderType } from '@/types/firebase';

/** The public card fields of `instructors.business`; VAT and legal name never ride in a row. */
export type PublicBusiness = Pick<BusinessDetails, 'displayName' | 'logoUrl'>;

/** Narrows a stored `business` object to its public card fields; undefined when absent. */
export function publicBusiness(business: unknown): PublicBusiness | undefined {
  if (!business || typeof business !== 'object') return undefined;
  const { displayName, logoUrl } = business as Record<string, unknown>;
  return {
    displayName: typeof displayName === 'string' ? displayName : '',
    logoUrl: typeof logoUrl === 'string' && logoUrl ? logoUrl : null,
  };
}

/**
 * The picture a provider is shown with: a company's logo, else the avatar. `providerType` is
 * the only discriminator — `business` may be stored on a doc regardless, so it is not trusted
 * on its own.
 */
export function providerImageUrl(p: {
  providerType?: ProviderType;
  business?: { logoUrl?: string | null } | null;
  avatarUrl?: string | null;
}): string | undefined {
  const logo = p.providerType === 'business' ? p.business?.logoUrl : undefined;
  return logo || p.avatarUrl || undefined;
}

/**
 * The booking flow's shape for a provider, built from the /instructors profile the /book
 * page loads (useProvider). The search page hands the booking store a search card; a trainer
 * profile or a deep link reaches /book without one, and the confirm page needs it.
 */
export function providerSearchResultFromProvider(provider: Provider): ProviderSearchResult {
  const hasCoords = typeof provider.lat === 'number' && typeof provider.lng === 'number';
  return {
    id: provider.id,
    fullName: provider.fullName,
    avatarUrl: provider.avatarUrl ?? undefined,
    rating: provider.rating,
    reviewCount: provider.reviewCount,
    isVerified: provider.isVerified,
    providerType: provider.providerType,
    business: publicBusiness(provider.business),
    specialties: provider.specialties,
    yearsOfExperience: provider.yearsOfExperience,
    languages: provider.languages,
    // Services are fetched separately (useProviderServices), as for search cards.
    services: [],
    location: hasCoords
      ? {
          lat: provider.lat as number,
          lng: provider.lng as number,
          address: provider.city ?? provider.location ?? '',
        }
      : undefined,
    lowestPrice: provider.lowestPrice,
    photoUrls: provider.photoUrls,
  };
}

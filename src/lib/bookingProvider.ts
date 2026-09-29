import type { Provider } from '@/types/instructor';
import type { ProviderSearchResult } from '@/types/booking';

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

import {
  collection,
  getDocs,
  query,
  where,
  limit,
  type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from './firebase/config';
import { geoRangeQuery } from './firebase/geoQuery';
import type { LatLng } from './geo';
import { normalizeSearchText, SEARCH_TOKEN_MAX_LENGTH } from './admin/adminIndex';
import { readBusinessDetails, toPublicBusiness } from './publicBusiness';
import type { ProviderSearchResult, SearchParams } from '@/types/booking';

/**
 * Searching the public /instructors mirror: the list and the radius search of /booking and the
 * "near you" trainers of /home.
 *
 * Its own module, not part of firebookings.ts, because those pages only search. firebookings
 * also creates, cancels and reschedules bookings (callables, firebase/functions, availability),
 * which /home never needs and which was in its first-load bundle (scripts/check-bundle-budget.mjs).
 * firebookings re-exports these for its existing callers.
 */

const INSTRUCTORS_COLLECTION = 'instructors';

/**
 * The key a search-box query is looked up by in `instructors.searchTerms`: the same
 * normalization the onInstructorWriteSearchIndex trigger stores prefixes with, so any prefix
 * of a provider's name (whole or per word), specialty or category matches. "" = no text query.
 */
export function providerSearchKey(raw: string | undefined): string {
  return normalizeSearchText(raw ?? '').slice(0, SEARCH_TOKEN_MAX_LENGTH).trim();
}

// Search providers based on filters. Reads the public /instructors mirror
// (allowed under firestore.rules for unauthenticated and authenticated users).
export async function searchProviders(params: SearchParams): Promise<ProviderSearchResult[]> {
  // A text query goes to Firestore as `searchTerms array-contains <key>`. It used to fetch the
  // first 50 providers by doc id and filter the text in memory, so a provider whose id sorted
  // after those 50 — every new signup, among 400+ — could not be found by their own name.
  //
  // Without text, a category is pushed into the query instead, so limit(50) doesn't burn
  // through unrelated docs. params.category is a TAXONOMY ID; categoryIds holds the leaf and
  // its ancestors, so one array-contains matches a group or a leaf. Firestore allows one
  // array-contains per query, so with both, the category is applied in memory below.
  const key = providerSearchKey(params.query);
  const constraints: QueryConstraint[] = [where('providerProfile.isVerified', '==', true)];
  if (key) {
    constraints.push(where('searchTerms', 'array-contains', key));
  } else if (params.category) {
    constraints.push(where('categoryIds', 'array-contains', params.category));
  }
  constraints.push(limit(50));
  const providersQuery = query(collection(db, INSTRUCTORS_COLLECTION), ...constraints);

  const snapshot = await getDocs(providersQuery);
  let providers = snapshot.docs
    .filter((doc) => !doc.data().activityKind)
    .map((doc) => providerSearchResultFromDoc(doc.id, doc.data()));
  if (key && params.category) {
    providers = providers.filter((p) => p.categoryIds?.includes(params.category!));
  }

  return applyProviderSearchFilters(providers, params);
}

/**
 * Verified providers within `radiusKm` of `center`, nearest-first with `distanceKm`: a
 * bounded geohash range search instead of the first 50 by doc id (which, located in Bari,
 * could all be in Milano). The same category constraint and in-memory filters as
 * searchProviders apply; distance, not `sortBy`, orders the result, as the near-me list
 * always has. Needs the (isVerified, geohash) and (isVerified, categoryIds, geohash)
 * composite indexes; the isVerified equality is also what the /instructors read rule needs.
 */
export async function searchProvidersNear(
  params: SearchParams,
  center: LatLng,
  radiusKm: number
): Promise<(ProviderSearchResult & { distanceKm: number })[]> {
  const filters: QueryConstraint[] = [where('providerProfile.isVerified', '==', true)];
  if (params.category) filters.push(where('categoryIds', 'array-contains', params.category));
  const near = await geoRangeQuery<ProviderSearchResult>({
    collectionPath: INSTRUCTORS_COLLECTION,
    filters,
    center,
    radiusKm,
    fromDoc: (id, data) => (data.activityKind ? null : providerSearchResultFromDoc(id, data)),
    getCoords: (p) => (p.location ? { lat: p.location.lat, lng: p.location.lng } : null),
  });
  return applyProviderSearchFilters(near, { ...params, sortBy: undefined });
}

/** Map an /instructors document to a search card. */
export function providerSearchResultFromDoc(
  id: string,
  data: DocumentData
): ProviderSearchResult {
  const profile = data.providerProfile || {};
  // Company badge/logo come from the `business` map only (providerType is owner-writable).
  // The result carries the public subset: the legal name is searchable, never displayed.
  const business = toPublicBusiness(readBusinessDetails(data.business));

  return {
    id,
    fullName: data.fullName || '',
    avatarUrl: data.avatarUrl || undefined,
    rating: profile.rating || 0,
    reviewCount: profile.reviewCount || 0,
    isVerified: profile.isVerified || false,
    specialties: profile.specialties || [],
    categoryIds: (data.categoryIds as string[]) || [],
    searchTerms: Array.isArray(data.searchTerms) ? (data.searchTerms as string[]) : undefined,
    yearsOfExperience: profile.yearsOfExperience || 0,
    languages: profile.languages || [],
    // Denormalized cheapest service price (written by the seeder from the
    // /services subcollection) so cards can show "Da X €" without fetching
    // every provider's services.
    lowestPrice: typeof data.lowestPrice === 'number' ? data.lowestPrice : undefined,
    location:
      typeof data.lat === 'number' && typeof data.lng === 'number'
        ? { lat: data.lat, lng: data.lng, address: (data.city as string) ?? '' }
        : undefined,
    // Services live in the /instructors/{id}/services subcollection and are
    // fetched lazily on the detail page (useProviderServices). Search cards
    // don't render service-level info, so we return an empty array here.
    services: [],
    ...(business
      ? { isBusiness: true, business, ...(business.logoUrl ? { logoUrl: business.logoUrl } : {}) }
      : {}),
  } as ProviderSearchResult;
}

/** The in-memory filters and sort shared by the list and the radius search. */
export function applyProviderSearchFilters<T extends ProviderSearchResult>(
  input: T[],
  params: SearchParams
): T[] {
  let providers = [...input];
  // Apply text search filter
  if (params.query) {
    const queryLower = params.query.toLowerCase();
    const key = providerSearchKey(params.query);
    providers = providers.filter(
      (p) =>
        // What the query matched on in Firestore (category words included), then the
        // substring fallback for documents the backfill hasn't reached.
        (key !== '' && p.searchTerms?.includes(key)) ||
        p.fullName.toLowerCase().includes(queryLower) ||
        p.specialties.some((s) => s.toLowerCase().includes(queryLower)) ||
        p.services.some((s) => s.name.toLowerCase().includes(queryLower))
    );
  }

  // No second in-memory category pass: the Firestore constraint above is exact. The old
  // one re-filtered by substring against display names, which quietly re-introduced the
  // name coupling the query had just escaped.

  // Apply price filter
  if (params.minPrice !== undefined) {
    providers = providers.filter(
      (p) => p.services.some((s) => s.price >= params.minPrice!)
    );
  }
  if (params.maxPrice !== undefined) {
    providers = providers.filter(
      (p) => p.services.some((s) => s.price <= params.maxPrice!)
    );
  }

  // Apply rating filter
  if (params.rating) {
    providers = providers.filter((p) => p.rating >= params.rating!);
  }

  // Apply sorting
  if (params.sortBy) {
    switch (params.sortBy) {
      case 'price':
        providers.sort((a, b) => (a.lowestPrice || Infinity) - (b.lowestPrice || Infinity));
        break;
      case 'rating':
        providers.sort((a, b) => b.rating - a.rating);
        break;
      case 'availability':
        // Sort by next available date
        providers.sort((a, b) => {
          if (!a.nextAvailable) return 1;
          if (!b.nextAvailable) return -1;
          return a.nextAvailable.getTime() - b.nextAvailable.getTime();
        });
        break;
    }
  }

  return providers;
}

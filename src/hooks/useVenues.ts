import { useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  fetchTopRatedVenuesPage,
  fetchVenue,
  fetchVenues,
  fetchVenuesNear,
  fetchVenueServices,
  type VenuePageCursor,
} from '@/lib/firebase/venues';
import type { Venue, VenueListOptions, VenueType } from '@/types/venue';
import { annotateAndSortByDistance, coordsOf, roundLocation, type LatLng } from '@/lib/geo';

const STALE_5_MIN = 5 * 60 * 1000;

export function useVenue(id: string | undefined) {
  return useQuery({
    queryKey: ['venue', id],
    queryFn: () => fetchVenue(id as string),
    enabled: !!id && id !== 'placeholder',
    staleTime: STALE_5_MIN,
  });
}

export function useVenues(opts: VenueListOptions = {}) {
  return useQuery({
    queryKey: ['venues', opts],
    queryFn: () => fetchVenues(opts),
    enabled: opts.enabled ?? true,
    staleTime: STALE_5_MIN,
  });
}

export type VenueWithDistance = Venue & { distanceKm?: number };

export interface NearbyVenuesResult {
  data: VenueWithDistance[] | undefined;
  isLoading: boolean;
  /** Location-less list only: another page of top-rated venues can be loaded. */
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}

const noop = () => undefined;

/**
 * The venue list for a "near me" screen, always a bounded read:
 *  - location + radius: geohash range search, only venues inside the radius, nearest-first;
 *  - otherwise: the top-rated venues, `VENUE_PAGE_SIZE` at a time with a (rating, id) cursor
 *    (`fetchTopRatedVenuesPage`), sorted by distance over the loaded pages when the location
 *    is known (radius "Tutti") and by rating when it isn't.
 */
export function useNearbyVenues(opts: {
  type?: VenueType;
  /** Several types at once, e.g. every venue that hosts courses. */
  types?: readonly VenueType[];
  userLocation: LatLng | null;
  radiusKm: number | null;
}): NearbyVenuesResult {
  const { type, types, userLocation, radiusKm } = opts;
  const center = userLocation ? roundLocation(userLocation) : null;
  const geo = center && radiusKm != null;

  const nearQuery = useQuery({
    queryKey: ['venues-near', type ?? null, types ?? null, center, radiusKm],
    queryFn: () => fetchVenuesNear({ type, types, center: center as LatLng, radiusKm: radiusKm as number }),
    enabled: !!geo,
    staleTime: STALE_5_MIN,
  });

  const topQuery = useInfiniteQuery({
    queryKey: ['venues', 'top-rated', type ?? null, types ?? null],
    queryFn: ({ pageParam }) => fetchTopRatedVenuesPage({ type, types, cursor: pageParam }),
    initialPageParam: null as VenuePageCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !geo,
    staleTime: STALE_5_MIN,
  });

  const topPages = topQuery.data?.pages;
  const annotatedTop = useMemo<VenueWithDistance[] | undefined>(() => {
    if (!topPages) return undefined;
    const loaded = topPages.flatMap((page) => page.venues);
    return userLocation ? annotateAndSortByDistance(loaded, userLocation, coordsOf) : loaded;
  }, [topPages, userLocation]);

  if (geo) {
    return {
      data: nearQuery.data as VenueWithDistance[] | undefined,
      isLoading: nearQuery.isLoading,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: noop,
    };
  }
  return {
    data: annotatedTop,
    isLoading: topQuery.isLoading,
    hasNextPage: topQuery.hasNextPage,
    isFetchingNextPage: topQuery.isFetchingNextPage,
    fetchNextPage: () => { void topQuery.fetchNextPage(); },
  };
}

export function useVenueServices(venueId: string | undefined) {
  return useQuery({
    queryKey: ['venue-services', venueId],
    queryFn: () => fetchVenueServices(venueId as string),
    enabled: !!venueId && venueId !== 'placeholder',
    staleTime: STALE_5_MIN,
  });
}


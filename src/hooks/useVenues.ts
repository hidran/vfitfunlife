import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchVenue,
  fetchVenues,
  fetchVenuesNear,
  fetchVenueServices,
  fetchVenueCourses,
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
    staleTime: STALE_5_MIN,
  });
}

/** Size of the location-less list: the top-rated venues, never the whole collection. */
export const NEARBY_FALLBACK_LIMIT = 50;

export type VenueWithDistance = Venue & { distanceKm?: number };

/**
 * The venue list for a "near me" screen, always a bounded read:
 *  - location + radius: geohash range search, only venues inside the radius, nearest-first;
 *  - otherwise: the top-rated `NEARBY_FALLBACK_LIMIT` venues, sorted by distance when the
 *    location is known (radius "Tutti") and by rating when it isn't.
 */
export function useNearbyVenues(opts: {
  type?: VenueType;
  userLocation: LatLng | null;
  radiusKm: number | null;
}) {
  const { type, userLocation, radiusKm } = opts;
  const center = userLocation ? roundLocation(userLocation) : null;
  const geo = center && radiusKm != null;

  const nearQuery = useQuery({
    queryKey: ['venues-near', type ?? null, center, radiusKm],
    queryFn: () => fetchVenuesNear({ type, center: center as LatLng, radiusKm: radiusKm as number }),
    enabled: !!geo,
    staleTime: STALE_5_MIN,
  });

  const listOpts: VenueListOptions = { type, orderByRating: true, limit: NEARBY_FALLBACK_LIMIT };
  const topQuery = useQuery({
    queryKey: ['venues', listOpts],
    queryFn: () => fetchVenues(listOpts),
    enabled: !geo,
    staleTime: STALE_5_MIN,
  });

  const topData = topQuery.data;
  const annotatedTop = useMemo<VenueWithDistance[] | undefined>(
    () => (topData && userLocation ? annotateAndSortByDistance(topData, userLocation, coordsOf) : topData),
    [topData, userLocation]
  );

  if (geo) return { data: nearQuery.data as VenueWithDistance[] | undefined, isLoading: nearQuery.isLoading };
  return { data: annotatedTop, isLoading: topQuery.isLoading };
}

export function useVenueServices(venueId: string | undefined) {
  return useQuery({
    queryKey: ['venue-services', venueId],
    queryFn: () => fetchVenueServices(venueId as string),
    enabled: !!venueId && venueId !== 'placeholder',
    staleTime: STALE_5_MIN,
  });
}

export function useVenueCourses(venueId: string | undefined) {
  return useQuery({
    queryKey: ['venue-courses', venueId],
    queryFn: () => fetchVenueCourses(venueId as string),
    enabled: !!venueId && venueId !== 'placeholder',
    staleTime: STALE_5_MIN,
  });
}

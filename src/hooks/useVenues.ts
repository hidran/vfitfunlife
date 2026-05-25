import { useQuery } from '@tanstack/react-query';
import {
  fetchVenue,
  fetchVenues,
  fetchVenueServices,
  fetchVenueCourses,
} from '@/lib/firebase/venues';
import type { VenueListOptions } from '@/types/venue';

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

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { fetchManagedVenues } from '@/lib/firebase/venues';
import type { Venue } from '@/types/venue';

const NONE: Venue[] = [];

export const MANAGED_VENUES_KEY = ['managed-venues'] as const;

/**
 * Venues the signed-in user owns or staffs (they may run courses there). Empty while loading or on error; `isError` tells
 * a failed lookup from "manages none". The lookup is not retried: the provider area waits on it, and a manager who hits a
 * transient failure just reloads.
 */
export function useManagedVenues(): { venues: Venue[]; isLoading: boolean; isError: boolean } {
  const uid = useAuthStore((state) => state.user?.uid);
  const query = useQuery({
    queryKey: [...MANAGED_VENUES_KEY, uid],
    queryFn: () => fetchManagedVenues(uid!),
    enabled: !!uid,
    // Short and refetched on focus: when an admin removes a staff member, that person's client must stop showing the
    // venue screens within a minute (or on their next tab switch), not after a five-minute cache.
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  return { venues: query.data ?? NONE, isLoading: !!uid && query.isLoading, isError: !!uid && query.isError };
}

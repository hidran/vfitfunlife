import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { fetchManagedVenues } from '@/lib/firebase/venues';
import type { Venue } from '@/types/venue';

const NONE: Venue[] = [];

/**
 * Venues the signed-in user owns or staffs (they may run courses there). Empty while loading or on error; `isError` tells
 * a failed lookup from "manages none". The lookup is not retried: the provider area waits on it, and a manager who hits a
 * transient failure just reloads.
 */
export function useManagedVenues(): { venues: Venue[]; isLoading: boolean; isError: boolean } {
  const uid = useAuthStore((state) => state.user?.uid);
  const query = useQuery({
    queryKey: ['managed-venues', uid],
    queryFn: () => fetchManagedVenues(uid!),
    enabled: !!uid,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return { venues: query.data ?? NONE, isLoading: !!uid && query.isLoading, isError: !!uid && query.isError };
}

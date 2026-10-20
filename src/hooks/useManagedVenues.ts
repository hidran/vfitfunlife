import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { fetchManagedVenues } from '@/lib/firebase/venues';
import type { Venue } from '@/types/venue';

const NONE: Venue[] = [];

/** Venues the signed-in user owns or staffs (they may run courses there). Empty while loading or on error. */
export function useManagedVenues(): { venues: Venue[]; isLoading: boolean } {
  const uid = useAuthStore((state) => state.user?.uid);
  const query = useQuery({
    queryKey: ['managed-venues', uid],
    queryFn: () => fetchManagedVenues(uid!),
    enabled: !!uid,
    staleTime: 5 * 60 * 1000,
  });
  return { venues: query.data ?? NONE, isLoading: !!uid && query.isLoading };
}

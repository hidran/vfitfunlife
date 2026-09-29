import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMyLocation, saveMyLocation } from '@/lib/firebase/providerLocation';

export const myLocationKey = (uid: string | undefined) => ['my-location', uid] as const;

/**
 * The signed-in provider's saved search location (null: no instructor profile). staleTime 0
 * so the missing-location nudge goes away as soon as they come back from saving.
 */
export function useMyLocation(uid: string | undefined) {
  return useQuery({
    queryKey: myLocationKey(uid),
    queryFn: () => fetchMyLocation(uid as string),
    enabled: !!uid,
    staleTime: 0,
  });
}

export function useSaveMyLocation(uid: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { lat: number; lng: number; city: string }) => {
      if (!uid) throw new Error('not-signed-in');
      return saveMyLocation(uid, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: myLocationKey(uid) });
      // The public profile and search cards read the same doc.
      queryClient.invalidateQueries({ queryKey: ['provider', uid] });
    },
  });
}

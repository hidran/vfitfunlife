import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchCustomerSearchLocation, saveCustomerSearchLocation } from '@/lib/firebase/customerSearchLocation';
import { useAuthStore } from '@/stores/authStore';
import type { LatLng } from '@/lib/geo';

export const customerSearchLocationKey = (uid: string | undefined) => ['customer-search-location', uid] as const;

/** Saved location for the signed-in user's local discovery; no device permission is requested here. */
export function useCustomerSearchLocation() {
  const uid = useAuthStore((state) => state.user?.id);
  return useQuery({
    queryKey: customerSearchLocationKey(uid),
    queryFn: () => fetchCustomerSearchLocation(uid as string),
    enabled: !!uid,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveCustomerSearchLocation() {
  const uid = useAuthStore((state) => state.user?.id);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (location: LatLng) => {
      if (!uid) throw new Error('not-signed-in');
      return saveCustomerSearchLocation(uid, location);
    },
    onSuccess: (location) => {
      queryClient.setQueryData(customerSearchLocationKey(uid), location);
      queryClient.invalidateQueries({ queryKey: customerSearchLocationKey(uid) });
    },
  });
}

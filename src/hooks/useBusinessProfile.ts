import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchBusinessDetails, updateBusinessDisplayFields } from '@/lib/firebase/businessProfile';
import { queryKeys } from '@/lib/queryKeys';
import type { BusinessDisplayChanges } from '@/lib/businessDetails';
import type { BusinessDetails } from '@/types/firebase';

export const businessDetailsQueryKey = (uid: string | undefined) => ['businessDetails', uid] as const;

/** The company profile of `uid` (null for an individual). Disabled while `uid` is undefined. */
export function useBusinessDetails(uid: string | undefined) {
  return useQuery({
    queryKey: businessDetailsQueryKey(uid),
    queryFn: () => fetchBusinessDetails(uid as string),
    enabled: !!uid,
    // The owner is editing it: always start from what is stored.
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}

/**
 * Save the owner's display-field changes. On success the cached company profile takes the
 * new values, and the provider caches are refreshed so cards show the new public name.
 */
export function useUpdateBusinessDetails(uid: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (changes: BusinessDisplayChanges) => {
      if (!uid) throw new Error('uid required');
      return updateBusinessDisplayFields(uid, changes);
    },
    onSuccess: (_written, changes) => {
      qc.setQueryData<BusinessDetails | null>(businessDetailsQueryKey(uid), (prev) =>
        prev ? { ...prev, ...changes } : prev
      );
      void qc.invalidateQueries({ queryKey: ['provider', uid] });
      void qc.invalidateQueries({ queryKey: ['providers'] });
      // The owner's own public page shows the company name, logo and description.
      if (uid) void qc.invalidateQueries({ queryKey: queryKeys.providerPublicProfile(uid) });
    },
  });
}

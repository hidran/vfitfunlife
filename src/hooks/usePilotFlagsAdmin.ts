import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getPilotFlagsAdmin,
  setPilotFlags,
  type PilotFlagValues,
} from '@/lib/firebase/pilotFlagsAdmin';

const QUERY_KEY = ['pilot-flags-admin'];

/**
 * Live server template, superadmin-only. No staleTime: this is the panel's only source of
 * truth about what is actually published, so it should refetch rather than show a cached
 * value someone else may have superseded.
 */
export function usePilotFlagsAdmin() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: getPilotFlagsAdmin,
    staleTime: 0,
    retry: false,
  });
}

export function useSetPilotFlags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: Partial<PilotFlagValues>) => setPilotFlags(updates),
    onSuccess: (result) => {
      // The callable returns the freshly published template, so seed the cache with it
      // rather than refetching — and invalidate so an ETag conflict elsewhere still
      // reconciles on the next read.
      qc.setQueryData(QUERY_KEY, result);
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

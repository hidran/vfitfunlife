'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getAiAuthoringSettingsAdmin,
  updateAiAuthoringSettings,
  type AiAuthoringSettings,
} from '@/lib/firebase/functions';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Superadmin AI authoring (recipe/training generation) settings
 * (src/components/admin/settings/AiAuthoringSettings.tsx).
 *
 * `staleTime: 0` / `retry: false` matches `usePilotFlagsAdmin`: this panel is the only
 * source of truth about what is actually live, so it should refetch rather than show a
 * cached value another session may have superseded.
 */
export function useAiAuthoringSettingsAdmin() {
  return useQuery({
    queryKey: queryKeys.aiAuthoringSettings(),
    queryFn: getAiAuthoringSettingsAdmin,
    staleTime: 0,
    retry: false,
  });
}

export function useUpdateAiAuthoringSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<AiAuthoringSettings>) => updateAiAuthoringSettings(patch),
    // updateAiAuthoringSettings returns void, so there is nothing to seed the cache with —
    // just invalidate.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.aiAuthoringSettings() });
    },
  });
}

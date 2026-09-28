'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAiSettingsAdmin, updateAiSettings } from '@/lib/firebase/functions';
import type { AiAssistantSettings } from '@/types/assistant';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Superadmin AI assistant settings (src/components/admin/settings/AiAssistantSettings.tsx).
 *
 * `staleTime: 0` / `retry: false` matches `usePilotFlagsAdmin`: this panel is the only
 * source of truth about what is actually live, so it should refetch rather than show a
 * cached value another session may have superseded.
 */
export function useAiAssistantSettingsAdmin() {
  return useQuery({
    queryKey: queryKeys.aiAssistantSettings(),
    queryFn: getAiSettingsAdmin,
    staleTime: 0,
    retry: false,
  });
}

export function useUpdateAiAssistantSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<AiAssistantSettings>) => updateAiSettings(patch),
    // updateAiSettings returns void (unlike setPilotFlags, which returns the published
    // template), so there is nothing to seed the cache with — just invalidate.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.aiAssistantSettings() });
    },
  });
}

import { useQuery } from '@tanstack/react-query';
import { fetchFunActivities } from '@/lib/firebase/providers';
import type { ActivityKind } from '@/types/instructor';

export function useFunActivities(kind: ActivityKind, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['fun-activities', kind],
    queryFn: () => fetchFunActivities(kind),
    enabled: options.enabled ?? true,
    staleTime: 5 * 60_000,
  });
}

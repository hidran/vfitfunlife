import { useQuery } from '@tanstack/react-query';
import { fetchFunActivities } from '@/lib/firebase/providers';
import type { ActivityKind } from '@/types/instructor';

export function useFunActivities(kind: ActivityKind) {
  return useQuery({
    queryKey: ['fun-activities', kind],
    queryFn: () => fetchFunActivities(kind),
    staleTime: 5 * 60_000,
  });
}

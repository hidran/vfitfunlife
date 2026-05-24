import { useQuery } from '@tanstack/react-query';
import {
  fetchFitnessClasses, fetchHomeTrainingServices, fetchVirtualPrograms,
} from '@/lib/firebase/fitness';
import type { ClassCategory } from '@/types/fitness';

const STALE_5_MIN = 5 * 60 * 1000;

export function useFitnessClasses(opts: { category?: ClassCategory; limit?: number } = {}) {
  return useQuery({
    queryKey: ['fitness-classes', opts],
    queryFn: () => fetchFitnessClasses(opts),
    staleTime: STALE_5_MIN,
  });
}

export function useTodayClasses(limit = 3) {
  return useQuery({
    queryKey: ['today-classes', limit],
    queryFn: () => fetchFitnessClasses({ limit }),
    staleTime: STALE_5_MIN,
  });
}

export function useHomeTrainingServices(opts: { limit?: number } = {}) {
  return useQuery({
    queryKey: ['home-training-services', opts],
    queryFn: () => fetchHomeTrainingServices(opts),
    staleTime: STALE_5_MIN,
  });
}

export function useVirtualPrograms(opts: { limit?: number } = {}) {
  return useQuery({
    queryKey: ['virtual-programs', opts],
    queryFn: () => fetchVirtualPrograms(opts),
    staleTime: STALE_5_MIN,
  });
}

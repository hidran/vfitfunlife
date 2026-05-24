import { useQuery } from '@tanstack/react-query';
import {
  fetchProvider,
  fetchProviders,
  fetchProviderServices,
} from '@/lib/firebase/providers';
import type { ProviderListOptions } from '@/types/instructor';

const STALE_5_MIN = 5 * 60 * 1000;

export function useProvider(id: string | undefined) {
  return useQuery({
    queryKey: ['provider', id],
    queryFn: () => fetchProvider(id as string),
    enabled: !!id && id !== 'placeholder',
    staleTime: STALE_5_MIN,
  });
}

export function useProviders(opts: ProviderListOptions = {}) {
  return useQuery({
    queryKey: ['providers', opts],
    queryFn: () => fetchProviders(opts),
    staleTime: STALE_5_MIN,
  });
}

export function useProviderServices(providerId: string | undefined) {
  return useQuery({
    queryKey: ['provider-services', providerId],
    queryFn: () => fetchProviderServices(providerId as string),
    enabled: !!providerId && providerId !== 'placeholder',
    staleTime: STALE_5_MIN,
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createProviderService,
  deleteProviderService,
  fetchProvider,
  fetchProviders,
  fetchProviderServices,
  updateProviderService,
  type ProviderServiceInput,
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

/**
 * All three mutations invalidate the provider document as well as the service list:
 * a price change re-derives `lowestPrice` server-side, and that drives the "Da €N"
 * label and price sorting on every card.
 */
function useInvalidateProviderServices(providerId: string | undefined) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['provider-services', providerId] });
    void qc.invalidateQueries({ queryKey: ['provider', providerId] });
    void qc.invalidateQueries({ queryKey: ['providers'] });
  };
}

export function useCreateProviderService(providerId: string | undefined) {
  const invalidate = useInvalidateProviderServices(providerId);
  return useMutation({
    mutationFn: async (data: ProviderServiceInput) => {
      if (!providerId) throw new Error('providerId required');
      return createProviderService(providerId, data);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateProviderService(providerId: string | undefined) {
  const invalidate = useInvalidateProviderServices(providerId);
  return useMutation({
    mutationFn: async (vars: { serviceId: string; data: Partial<ProviderServiceInput> }) => {
      if (!providerId) throw new Error('providerId required');
      await updateProviderService(providerId, vars.serviceId, vars.data);
    },
    onSuccess: invalidate,
  });
}

export function useDeleteProviderService(providerId: string | undefined) {
  const invalidate = useInvalidateProviderServices(providerId);
  return useMutation({
    mutationFn: async (serviceId: string) => {
      if (!providerId) throw new Error('providerId required');
      await deleteProviderService(providerId, serviceId);
    },
    onSuccess: invalidate,
  });
}

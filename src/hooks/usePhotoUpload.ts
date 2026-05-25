import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateVenuePhotos } from '@/lib/firebase/venues';
import { updateProviderPhotos } from '@/lib/firebase/providers';

export function useUpdateVenuePhotos(venueId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (photoUrls: string[]) => {
      if (!venueId) throw new Error('venueId required');
      await updateVenuePhotos(venueId, photoUrls);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['venue', venueId] });
      void qc.invalidateQueries({ queryKey: ['venues'] });
    },
  });
}

export function useUpdateProviderPhotos(providerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (photoUrls: string[]) => {
      if (!providerId) throw new Error('providerId required');
      await updateProviderPhotos(providerId, photoUrls);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['provider', providerId] });
      void qc.invalidateQueries({ queryKey: ['providers'] });
    },
  });
}

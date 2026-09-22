import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { submitProviderApplication } from '@/lib/firebase/providerApplication';
import type { ProviderStatus } from '@/types/firebase';

/** Current user's provider status, from the already-loaded auth user. */
export function useProviderStatus(): ProviderStatus {
  return useAuthStore((s) => s.user?.providerStatus ?? 'none');
}

/** Submit a provider opt-in for the current user, then refresh the auth user. */
export function useSubmitProviderApplication() {
  return useMutation({
    mutationFn: async (categoryIds: string[]) => {
      const user = useAuthStore.getState().user;
      if (!user) throw new Error('Not authenticated');
      await submitProviderApplication({ fullName: user.fullName, categoryIds });
      return user.uid;
    },
    onSuccess: async (uid) => {
      await useAuthStore.getState().loadUserData(uid);
    },
  });
}

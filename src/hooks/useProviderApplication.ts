import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { submitProviderApplication } from '@/lib/firebase/providerApplication';
import type { ProviderStatus, ProviderType } from '@/types/firebase';
import type { BusinessApplicationInput } from '@/lib/firebase/functions';

/** Current user's provider status, from the already-loaded auth user. */
export function useProviderStatus(): ProviderStatus {
  return useAuthStore((s) => s.user?.providerStatus ?? 'none');
}

export interface ProviderApplicationInput {
  categoryIds: string[];
  /** Absent ⇒ 'individual'. */
  providerType?: ProviderType;
  /** Required when providerType is 'business'. */
  business?: BusinessApplicationInput;
}

/** Submit a provider opt-in for the current user, then refresh the auth user. */
export function useSubmitProviderApplication() {
  return useMutation({
    mutationFn: async ({ categoryIds, providerType, business }: ProviderApplicationInput) => {
      const user = useAuthStore.getState().user;
      if (!user) throw new Error('Not authenticated');
      await submitProviderApplication({ fullName: user.fullName, categoryIds, providerType, business });
      return user.uid;
    },
    onSuccess: async (uid) => {
      await useAuthStore.getState().loadUserData(uid);
    },
  });
}

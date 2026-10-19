import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import {
  submitProviderApplication,
  type ProviderApplicationChoice,
} from '@/lib/firebase/providerApplication';
import type { ProviderStatus, ProviderType } from '@/types/firebase';

/** Current user's provider status, from the already-loaded auth user. */
export function useProviderStatus(): ProviderStatus {
  return useAuthStore((s) => s.user?.providerStatus ?? 'none');
}

export interface SubmittedProviderApplication {
  uid: string;
  providerType: ProviderType;
  /** From the callable: true when approved on the spot, false when queued for review. */
  autoApproved?: boolean;
}

/**
 * Submit a provider opt-in for the current user, then refresh the auth user.
 *
 * Takes the requested category ids (an individual — the original call), or a full choice for a
 * company: `{ categoryIds, providerType: 'business', business }`.
 */
export function useSubmitProviderApplication() {
  return useMutation({
    mutationFn: async (
      request: string[] | ProviderApplicationChoice
    ): Promise<SubmittedProviderApplication> => {
      const user = useAuthStore.getState().user;
      if (!user) throw new Error('Not authenticated');
      const choice: ProviderApplicationChoice = Array.isArray(request)
        ? { categoryIds: request }
        : request;
      const result = await submitProviderApplication({ ...choice, fullName: user.fullName });
      return {
        uid: user.uid,
        providerType: choice.providerType === 'business' ? 'business' : 'individual',
        autoApproved: result?.autoApproved,
      };
    },
    onSuccess: async ({ uid }) => {
      await useAuthStore.getState().loadUserData(uid);
    },
  });
}

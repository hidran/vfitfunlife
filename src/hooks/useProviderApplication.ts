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
  const user = useAuthStore((s) => s.user);
  const loadUserData = useAuthStore((s) => s.loadUserData);
  return useMutation({
    mutationFn: async (categoryName: string) => {
      if (!user) throw new Error('Not authenticated');
      await submitProviderApplication(user.uid, { fullName: user.fullName, categoryName });
    },
    onSuccess: async () => {
      if (user) await loadUserData(user.uid);
    },
  });
}

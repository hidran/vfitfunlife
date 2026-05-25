'use client';

import { useAuthStore } from '@/stores/authStore';

/**
 * @deprecated Use useAuthStore directly instead.
 * This hook exists for backward compatibility.
 */
export function useAuth() {
  const firebaseUser = useAuthStore((state) => state.firebaseUser);
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const isInitialized = useAuthStore((state) => state.isInitialized);

  return {
    user: firebaseUser,
    firestoreUser: user,
    loading: !isInitialized || isLoading,
    isInitialized,
  };
}
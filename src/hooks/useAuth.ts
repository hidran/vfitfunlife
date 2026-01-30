'use client';

import { useAuthStore } from '@/stores/authStore';

/**
 * @deprecated Use useAuthStore directly instead.
 * This hook exists for backward compatibility.
 */
export function useAuth() {
  const { firebaseUser, user, isLoading, isInitialized } = useAuthStore();

  return {
    user: firebaseUser,
    firestoreUser: user,
    loading: !isInitialized || isLoading,
    isInitialized,
  };
}
'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/authStore';

interface AuthContextValue {
  isInitialized: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * AuthProvider initializes the auth listener on mount.
 * All auth state is managed by useAuthStore.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    const unsubscribe = initialize();
    return unsubscribe;
  }, [initialize]);

  return (
    <AuthContext.Provider value={{ isInitialized }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}

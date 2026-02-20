'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect, type ReactNode } from 'react';
import { SectionProvider } from '@/contexts/SectionContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { I18nProvider } from '@/contexts/I18nContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { initializeCapacitor } from '@/lib/capacitor';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  // Initialize Capacitor on mount
  useEffect(() => {
    initializeCapacitor().catch((error) => {
      console.error('[Providers] Failed to initialize Capacitor:', error);
    });
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <AuthProvider>
            <SectionProvider>{children}</SectionProvider>
          </AuthProvider>
        </I18nProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

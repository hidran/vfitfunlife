'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useState, useEffect, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { SectionProvider } from '@/contexts/SectionContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { I18nProvider } from '@/contexts/I18nContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { ProfilePreferencesSync } from '@/hooks/useProfilePreferencesSync';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { initializeCapacitor } from '@/lib/capacitor';
import { scheduleAppShellRegistration } from '@/lib/sw/appShell';
import { PushRegistrar } from '@/components/push/PushRegistrar';

const FloatingAssistantButton = dynamic(
  () =>
    import('@/components/assistant/FloatingAssistantButton').then(
      (mod) => mod.FloatingAssistantButton
    ),
  { ssr: false, loading: () => null }
);

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
    // Offline app shell (web only; no-op on native and in dev).
    scheduleAppShellRegistration();
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <I18nProvider>
            <AuthProvider>
              <ProfilePreferencesSync />
              <PushRegistrar />
              <SectionProvider>{children}</SectionProvider>
              <FloatingAssistantButton />
            </AuthProvider>
          </I18nProvider>
        </ThemeProvider>
        <Toaster
          position="bottom-center"
          theme="dark"
          richColors
          closeButton
          duration={4000}
          offset={{ bottom: 24 }}
          mobileOffset={{ bottom: 'calc(env(safe-area-inset-bottom) + 80px)' }}
        />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

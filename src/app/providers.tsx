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
import { useAssistantStore } from '@/stores/assistantStore';
import { useAuthStore } from '@/stores/authStore';

// Opened from the menus (side drawer, provider nav, admin sidebar); the sheet's chunk is
// only fetched the first time someone opens it.
const AssistantSheet = dynamic(
  () => import('@/components/assistant/AssistantSheet').then((mod) => mod.AssistantSheet),
  { ssr: false, loading: () => null }
);

function AssistantHost() {
  const isOpen = useAssistantStore((s) => s.isOpen);
  const signedIn = useAuthStore((s) => !!s.user);
  return isOpen && signedIn ? <AssistantSheet /> : null;
}

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
              <AssistantHost />
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

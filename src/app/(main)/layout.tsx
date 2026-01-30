'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { MainLayout } from '@/components/layout/MainLayout';
import type { ReactNode } from 'react';

interface MainAppLayoutProps {
  children: ReactNode;
}

export default function MainAppLayout({ children }: MainAppLayoutProps) {
  const { firebaseUser, user, isLoading, isInitialized } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    // Only redirect after auth is initialized
    if (!isInitialized) return;

    // Redirect to login if not authenticated
    if (!firebaseUser) {
      router.replace('/auth/login');
    } else if (!user) {
      // Has firebase user but no profile - redirect to register
      router.replace('/auth/register');
    }
  }, [firebaseUser, user, isInitialized, router]);

  // Show loading state while checking authentication
  if (!isInitialized || isLoading) {
    return (
      <div className="min-h-screen bg-background-dark flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-white/20 border-t-section-primary rounded-full animate-spin" />
          <p className="text-text-tertiary text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render content if not authenticated (will redirect)
  if (!firebaseUser || !user) {
    return (
      <div className="min-h-screen bg-background-dark flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-white/20 border-t-section-primary rounded-full animate-spin" />
          <p className="text-text-tertiary text-sm">Redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <MainLayout
      notificationCount={3} // TODO: Get from notifications context/query
      userAvatarUrl={user.avatarUrl || firebaseUser.photoURL}
    >
      {children}
    </MainLayout>
  );
}

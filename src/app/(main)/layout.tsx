'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import type { ReactNode } from 'react';

interface MainAppLayoutProps {
  children: ReactNode;
}

export default function MainAppLayout({ children }: MainAppLayoutProps) {
  const { user, loading } = useAuthContext();
  const router = useRouter();

  useEffect(() => {
    // Redirect to login if not authenticated
    if (!loading && !user) {
      router.replace('/auth/login');
    }
  }, [user, loading, router]);

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen bg-background-dark flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          {/* Loading spinner */}
          <div className="w-10 h-10 border-3 border-white/20 border-t-section-primary rounded-full animate-spin" />
          <p className="text-text-tertiary text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render content if not authenticated (will redirect)
  if (!user) {
    return (
      <div className="min-h-screen bg-background-dark flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-white/20 border-t-section-primary rounded-full animate-spin" />
          <p className="text-text-tertiary text-sm">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <MainLayout
      notificationCount={3} // TODO: Get from notifications context/query
      userAvatarUrl={user.photoURL}
    >
      {children}
    </MainLayout>
  );
}

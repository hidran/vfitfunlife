'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { MainLayout } from '@/components/layout/MainLayout';
import { useI18n } from '@/hooks/useI18n';
import type { ReactNode } from 'react';
import { EmailVerificationBanner } from '@/components/auth/EmailVerificationBanner';

interface MainAppLayoutProps {
  children: ReactNode;
}

export default function MainAppLayout({ children }: MainAppLayoutProps) {
  const firebaseUser = useAuthStore((state) => state.firebaseUser);
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const isInitialized = useAuthStore((state) => state.isInitialized);

  const { t, setLocale } = useI18n();
  const notificationCount = useNotificationStore((state) =>
    state.notifications.reduce((count, notification) => count + (notification.read ? 0 : 1), 0)
  );
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

  useEffect(() => {
    if (user?.preferredLanguage) {
      setLocale(user.preferredLanguage);
    }
  }, [setLocale, user?.preferredLanguage]);

  // Show loading state while checking authentication
  if (!isInitialized || isLoading) {
    return (
      <div className="min-h-screen bg-background-dark flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-white/20 border-t-section-primary rounded-full animate-spin" />
          <p className="text-text-tertiary text-sm">{t('common.loading')}</p>
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
          <p className="text-text-tertiary text-sm">{t('common.redirecting')}</p>
        </div>
      </div>
    );
  }

  return (
    <MainLayout
      notificationCount={notificationCount}
      userAvatarUrl={user.avatarUrl || firebaseUser.photoURL}
      userName={user.fullName || firebaseUser.displayName || undefined}
      userEmail={user.email || firebaseUser.email || undefined}
      pointsBalance={user.pointsBalance || 0}
      walletBalance={user.walletBalance || 0}
      isProfessionalMode={
        user.role === 'provider' ||
        user.providerStatus === 'pending' ||
        user.providerStatus === 'verified'
      }
    >
      <EmailVerificationBanner />
      {children}
    </MainLayout>
  );
}

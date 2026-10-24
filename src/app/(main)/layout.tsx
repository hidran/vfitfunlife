'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { startNotificationInbox, useNotificationStore } from '@/stores/notificationStore';
import { MainLayout } from '@/components/layout/MainLayout';
import { useI18n } from '@/hooks/useI18n';
import type { ReactNode } from 'react';
import { EmailVerificationBanner } from '@/components/auth/EmailVerificationBanner';
import { isPublicMainRoute } from '@/lib/auth/publicRoutes';
import { currentPathWithSearch, loginHref } from '@/lib/auth/returnTo';

interface MainAppLayoutProps {
  children: ReactNode;
}

export default function MainAppLayout({ children }: MainAppLayoutProps) {
  const firebaseUser = useAuthStore((state) => state.firebaseUser);
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const isInitialized = useAuthStore((state) => state.isInitialized);

  const { t } = useI18n();
  const notificationCount = useNotificationStore((state) => state.unreadCount);
  const router = useRouter();
  const pathname = usePathname();
  const uid = firebaseUser?.uid;

  // The discovery pages (gyms list, venue, timetable, courses) are open to a signed-out visitor; booking from
  // them sends to sign-in and back (src/lib/auth/publicRoutes.ts). Every other page redirects below.
  const isPublic = isPublicMainRoute(pathname);

  // One realtime listener on users/{uid}/notifications for the whole signed-in shell; the
  // Header badge and /notifications both read it.
  useEffect(() => {
    if (!uid) return;
    return startNotificationInbox(uid);
  }, [uid]);

  useEffect(() => {
    // Only redirect after auth is initialized
    if (!isInitialized) return;

    if (!firebaseUser) {
      // Signed out: a public page renders for the visitor; any other page asks to sign in and comes back here
      // (`/auth/login?next=<page with its query>`).
      if (!isPublic) router.replace(loginHref(currentPathWithSearch() ?? pathname ?? '/'));
    } else if (!user) {
      // Has firebase user but no profile - redirect to register
      router.replace('/auth/register');
    }
  }, [firebaseUser, user, isInitialized, isPublic, pathname, router]);

  // The profile's preferredLanguage is applied app-wide by ProfilePreferencesSync
  // (src/app/providers.tsx), which also covers the admin and provider shells.

  // Show loading state while checking authentication
  if (!isInitialized || isLoading) {
    return (
      <div className="min-h-screen bg-background-dark flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-content/20 border-t-section-primary rounded-full animate-spin" />
          <p className="text-text-tertiary text-sm">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  const visitor = !firebaseUser && isPublic;

  // Don't render content when the redirect above is pending (signed out on a private page, or no profile yet)
  if (!visitor && (!firebaseUser || !user)) {
    return (
      <div className="min-h-screen bg-background-dark flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-content/20 border-t-section-primary rounded-full animate-spin" />
          <p className="text-text-tertiary text-sm">{t('common.redirecting')}</p>
        </div>
      </div>
    );
  }

  if (visitor) {
    // useSearchParams needs a Suspense boundary under `output: 'export'` (the query is unknown at build time);
    // the fallback is the same shell without the query in the return address.
    return (
      <Suspense fallback={<MainLayout signInHref={loginHref(pathname ?? '/')}>{children}</MainLayout>}>
        <VisitorShell pathname={pathname ?? '/'}>{children}</VisitorShell>
      </Suspense>
    );
  }

  // Narrowed above: a non-visitor render has both the Firebase user and the profile.
  const signedInUser = user!;
  const signedInFirebaseUser = firebaseUser!;

  return (
    <MainLayout
      notificationCount={notificationCount}
      userAvatarUrl={signedInUser.avatarUrl || signedInFirebaseUser.photoURL}
      userName={signedInUser.fullName || signedInFirebaseUser.displayName || undefined}
      userEmail={signedInUser.email || signedInFirebaseUser.email || undefined}
      pointsBalance={signedInUser.pointsBalance || 0}
      walletBalance={signedInUser.walletBalance || 0}
    >
      <EmailVerificationBanner />
      {children}
    </MainLayout>
  );
}

/** The visitor's shell: header and drawer carry a sign-in CTA that returns to this page with its query (`/venue?id=…`). */
function VisitorShell({ pathname, children }: { pathname: string; children: ReactNode }) {
  const search = useSearchParams()?.toString();
  return <MainLayout signInHref={loginHref(search ? `${pathname}?${search}` : pathname)}>{children}</MainLayout>;
}

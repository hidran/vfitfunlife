'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/hooks/useI18n';
import { notify } from '@/lib/notify';

/**
 * Registers the device for push whenever a user is signed in (login and auth restore
 * alike — this is also the token refresh), shows foreground pushes as a toast and routes
 * notification taps. Renders nothing. The FCM module is loaded lazily after sign-in so
 * firebase/messaging stays out of the root bundle.
 *
 * Web never prompts from here (browsers want a user gesture): it only registers when
 * permission was already granted on /auth/permissions or in notification settings.
 * Native asks once, on first sign-in.
 */
export function PushRegistrar() {
  const uid = useAuthStore((s) => s.firebaseUser?.uid ?? null);
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    import('@/lib/push/fcmRegistration')
      .then(({ enablePush, setPushHandlers }) => {
        if (cancelled) return;
        setPushHandlers({
          onForeground: ({ title, body, url }) => {
            if (!title && !body) return;
            notify.info(title || body, {
              description: title ? body : undefined,
              action: { label: t('push.toast.open'), onClick: () => router.push(url) },
            });
          },
          onNavigate: (url) => router.push(url),
        });
        return enablePush({ requestPermission: Capacitor.isNativePlatform() });
      })
      .catch((err) => console.warn('[push] registration skipped:', err));
    return () => {
      cancelled = true;
    };
  }, [uid, router, t]);

  return null;
}

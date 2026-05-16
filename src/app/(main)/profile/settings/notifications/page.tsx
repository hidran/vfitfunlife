'use client';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { NotificationSettingsForm } from '@/components/profile/NotificationSettingsForm';
import { defaultNotificationSettings } from '@/types/profile';
import { useI18n } from '@/hooks/useI18n';

export default function NotificationSettingsPage() {
  const router = useRouter();
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);

  return (
    <main className="container-mobile py-6">
      <button onClick={() => router.back()} aria-label="Back" className="mb-4 inline-flex items-center gap-1 text-sm">
        <ChevronLeft className="h-4 w-4" /> Back
      </button>
      <h1 className="mb-6 text-2xl font-display font-bold">{t('profile.settings.notifications.sectionTitle')}</h1>
      {user && (
        <NotificationSettingsForm
          initial={(user as any).notificationSettings ?? defaultNotificationSettings}
          onSaved={() => router.back()}
        />
      )}
    </main>
  );
}

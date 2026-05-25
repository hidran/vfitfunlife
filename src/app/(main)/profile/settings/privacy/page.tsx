'use client';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { PrivacySettingsForm } from '@/components/profile/PrivacySettingsForm';
import { defaultPrivacySettings } from '@/types/profile';
import { useI18n } from '@/hooks/useI18n';

export default function PrivacySettingsPage() {
  const router = useRouter();
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);

  return (
    <main className="container-mobile py-6">
      <button onClick={() => router.back()} aria-label="Back" className="mb-4 inline-flex items-center gap-1 text-sm">
        <ChevronLeft className="h-4 w-4" /> Back
      </button>
      <h1 className="mb-6 text-2xl font-display font-bold">{t('profile.settings.privacy.sectionTitle')}</h1>
      {user && (
        <PrivacySettingsForm
          initial={(user as any).privacySettings ?? defaultPrivacySettings}
          onSaved={() => router.back()}
        />
      )}
    </main>
  );
}

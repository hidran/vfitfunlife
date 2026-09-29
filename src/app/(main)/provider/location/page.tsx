'use client';

import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/hooks/useI18n';
import { useMyLocation, useSaveMyLocation } from '@/hooks/useMyLocation';
import { LocationEditor } from '@/components/provider/LocationEditor';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Where a provider sets the position "near me" search finds them at (D4: trainers set their
 * own location). Writes lat/lng/geohash/city on instructors/{uid}.
 */
export default function ProviderLocationPage() {
  const { t } = useI18n();
  const uid = useAuthStore((s) => s.user?.id);
  const { data: location, isLoading, isError } = useMyLocation(uid);
  const save = useSaveMyLocation(uid);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-content">{t('provider.location.title')}</h1>
        <p className="mt-1 text-content-muted">{t('provider.location.subtitle')}</p>
      </div>

      {!uid || isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : isError || !location ? (
        <p role="alert" className="rounded-xl border border-hairline bg-surface-2 p-4 text-sm text-content-muted">
          {t('provider.location.noProfile')}
        </p>
      ) : (
        <LocationEditor initial={location} onSave={(input) => save.mutateAsync(input)} />
      )}
    </div>
  );
}

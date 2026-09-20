'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { AvailabilityEditor } from '@/components/provider/AvailabilityEditor';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import { useProviderStore } from '@/stores/providerStore';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/hooks/useI18n';
import { availabilitySaveErrorKey, dayOfWeekFromError } from '@/lib/availability/errors';
import type { MessageKey } from '@/i18n/messages';
import type { AvailabilitySettings } from '@/types/provider';

/** 0 = Sunday … 6 = Saturday, matching the server's WeeklyWindow.dayOfWeek and dayOfWeekFromError. */
const DAY_OF_WEEK_LABEL_KEYS: MessageKey[] = [
  'provider.availabilityEditor.day.sunday',
  'provider.availabilityEditor.day.monday',
  'provider.availabilityEditor.day.tuesday',
  'provider.availabilityEditor.day.wednesday',
  'provider.availabilityEditor.day.thursday',
  'provider.availabilityEditor.day.friday',
  'provider.availabilityEditor.day.saturday',
];

export default function ProviderAvailabilityPage() {
  const { t } = useI18n();
  const {
    availability,
    availabilityVersion,
    availabilityLoadError,
    isLoading,
    fetchAvailability,
    updateAvailability,
  } = useProviderStore();
  const [saveResult, setSaveResult] = useState<
    { ok: true } | { ok: false; key: MessageKey; day: number | null } | null
  >(null);
  const saveResultRef = useRef<HTMLDivElement | null>(null);

  // The provider layout can mount this page before auth restores on a hard reload or deep
  // link, so the fetch waits for a uid and re-runs once one shows up — the stable action
  // reference alone would never re-trigger it.
  const uid = useAuthStore((s) => s.user?.id);
  const isAuthInitialized = useAuthStore((s) => s.isInitialized);
  const authMissing = isAuthInitialized && !uid;

  useEffect(() => {
    if (uid) fetchAvailability();
  }, [uid, fetchAvailability]);

  // The Save button lives at the bottom of a long editor; a phone user who just tapped it
  // never sees the result banner above unless we bring it into view for them.
  useEffect(() => {
    if (saveResult) saveResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [saveResult]);

  const handleSave = async (settings: AvailabilitySettings) => {
    setSaveResult(null);
    try {
      await updateAvailability(settings);
      setSaveResult({ ok: true });
    } catch (err) {
      console.error('Saving availability failed:', err);
      setSaveResult({ ok: false, key: availabilitySaveErrorKey(err), day: dayOfWeekFromError(err) });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-content">{t('provider.availability.title')}</h1>
        <p className="text-gray-400 mt-1">
          {t('provider.availability.subtitle')}
        </p>
      </div>

      <div ref={saveResultRef}>
        {saveResult?.ok === true && (
          <div role="status" className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/15 p-4 text-sm text-success">
            <CheckCircle className="h-5 w-5 flex-shrink-0" />
            {t('provider.availability.saved')}
          </div>
        )}
        {saveResult?.ok === false && (
          <div role="alert" className="flex items-center gap-3 rounded-xl border border-error/40 bg-error/15 p-4 text-sm text-error">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            {saveResult.day != null
              ? t('provider.availability.error.invalidDay', { day: t(DAY_OF_WEEK_LABEL_KEYS[saveResult.day]) })
              : t(saveResult.key)}
          </div>
        )}
      </div>

      {availability ? (
        <AvailabilityEditor
          key={availabilityVersion}
          settings={availability}
          onSave={handleSave}
          loading={isLoading}
        />
      ) : (availabilityLoadError || authMissing) ? (
        <div role="alert" className="rounded-xl border border-error/40 bg-error/15 p-4 text-sm text-error">
          <p>{t('provider.availability.error.load')}</p>
          <Button variant="secondary" size="sm" className="mt-3 min-h-[44px]" onClick={() => fetchAvailability()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : (
        <div className="flex justify-center py-12">
          <Spinner size="md" />
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { AvailabilityEditor } from '@/components/provider/AvailabilityEditor';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import { useProviderStore } from '@/stores/providerStore';
import { useI18n } from '@/hooks/useI18n';
import { availabilitySaveErrorKey } from '@/lib/availability/errors';
import type { MessageKey } from '@/i18n/messages';
import type { AvailabilitySettings } from '@/types/provider';

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
  const [saveResult, setSaveResult] = useState<{ ok: true } | { ok: false; key: MessageKey } | null>(null);

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  const handleSave = async (settings: AvailabilitySettings) => {
    setSaveResult(null);
    try {
      await updateAvailability(settings);
      setSaveResult({ ok: true });
    } catch (err) {
      console.error('Saving availability failed:', err);
      setSaveResult({ ok: false, key: availabilitySaveErrorKey(err) });
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

      {saveResult?.ok === true && (
        <div role="status" className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/15 p-4 text-sm text-success">
          <CheckCircle className="h-5 w-5 flex-shrink-0" />
          {t('provider.availability.saved')}
        </div>
      )}
      {saveResult?.ok === false && (
        <div role="alert" className="flex items-center gap-3 rounded-xl border border-error/40 bg-error/15 p-4 text-sm text-error">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          {t(saveResult.key)}
        </div>
      )}

      {availability ? (
        <AvailabilityEditor
          key={availabilityVersion}
          settings={availability}
          onSave={handleSave}
          loading={isLoading}
        />
      ) : availabilityLoadError ? (
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

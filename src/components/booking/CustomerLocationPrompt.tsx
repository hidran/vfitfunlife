'use client';

import { useState } from 'react';
import { Loader2, MapPin, X } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { useSaveCustomerSearchLocation } from '@/hooks/useCustomerSearchLocation';
import { getDevicePosition } from '@/lib/deviceLocation';

export const CUSTOMER_LOCATION_PROMPT_DISMISSED_KEY = 'vfit.customerLocationPrompt.dismissed';

interface CustomerLocationPromptProps {
  open: boolean;
  onDismiss: () => void;
}

export function CustomerLocationPrompt({ open, onDismiss }: CustomerLocationPromptProps) {
  const { t } = useI18n();
  const saveLocation = useSaveCustomerSearchLocation();
  const [error, setError] = useState(false);
  const isSaving = saveLocation.isPending;

  if (!open) return null;

  const handleSave = async () => {
    setError(false);
    try {
      const location = await getDevicePosition();
      await saveLocation.mutateAsync(location);
      onDismiss();
    } catch {
      setError(true);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" data-testid="customer-location-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-location-title"
        className="w-full max-w-sm rounded-2xl border border-hairline bg-background-dark p-5 text-content shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-section-primary/15 text-section-primary">
              <MapPin className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 id="customer-location-title" className="text-lg font-semibold text-text-inverse">
              {t('booking.locationPrompt.title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            disabled={isSaving}
            aria-label={t('common.close')}
            className="flex h-11 w-11 items-center justify-center rounded-full text-text-tertiary hover:bg-content/5 hover:text-content disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-text-secondary">
          {t('booking.locationPrompt.description')}
        </p>
        <p className="mt-2 text-xs text-text-tertiary">
          {t('booking.locationPrompt.privacy')}
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-error">
            {t('booking.locationPrompt.error')}
          </p>
        )}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onDismiss}
            disabled={isSaving}
            className="min-h-11 rounded-xl border border-hairline px-4 py-2 text-sm font-semibold text-text-secondary hover:bg-content/5 disabled:opacity-50"
          >
            {t('booking.locationPrompt.notNow')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-section-primary px-4 py-2 text-sm font-semibold text-background-dark hover:opacity-90 disabled:opacity-60"
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {t(isSaving ? 'booking.locationPrompt.saving' : 'booking.locationPrompt.save')}
          </button>
        </div>
      </section>
    </div>
  );
}

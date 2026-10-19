'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Building2, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import { useI18n } from '@/hooks/useI18n';
import { useBusinessDetails } from '@/hooks/useBusinessDetails';
import { businessDetailsFromProvider, toBusinessProfilePatch } from '@/lib/businessDetails';
import { updateBusinessDetails, uploadBusinessLogo } from '@/lib/firebase/business';
import { fetchProvider } from '@/lib/firebase/providers';
import type { MessageKey } from '@/i18n/messages';
import { BusinessDetailsForm } from './BusinessDetailsForm';

interface BusinessProfileSectionProps {
  /** The signed-in business provider; instructors/{uid} holds the company. */
  uid: string;
}

const ID_PREFIX = 'profile-business-edit';

/**
 * Company card on the profile editor's professional tab. The owner can change what the
 * marketplace shows (public name, description, website, city, logo); the admin-verified
 * fields are read-only here and frozen by firestore.rules. Saves on its own, apart from
 * the page's Save button, because it writes `instructors/{uid}` rather than `users/{uid}`.
 */
export function BusinessProfileSection({ uid }: BusinessProfileSectionProps) {
  const { t } = useI18n();
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [logoError, setLogoError] = useState<MessageKey | null>(null);
  const business = useBusinessDetails(ID_PREFIX, { disabled: isSaving, mode: 'edit' });
  const { setValues } = business;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bumped by the retry button so the load effect runs again.
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    fetchProvider(uid).then((provider) => {
      if (cancelled) return;
      if (!provider?.business) {
        setLoadState('error');
        return;
      }
      setValues(businessDetailsFromProvider(provider.business));
      setLogoUrl(provider.business.logoUrl ?? null);
      setLoadState('ready');
    });
    return () => {
      cancelled = true;
    };
  }, [uid, loadAttempt, setValues]);

  const handleSave = async () => {
    setSaveStatus('idle');
    if (!business.validate()) return;
    setIsSaving(true);
    try {
      await updateBusinessDetails(uid, toBusinessProfilePatch(business.values));
      setSaveStatus('saved');
      setLogoError(null);
    } catch (error) {
      console.error('[BusinessProfileSection] save', error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Upload, then point the company at the new file. If the Firestore write fails the
   * uploaded object stays in storage, and a replaced logo is not deleted either: both are
   * intentional — the gallery folder is cheap and an old URL may still be cached by
   * clients, so nothing here removes files.
   */
  const handleLogoPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError(null);
    setIsUploading(true);
    try {
      const url = await uploadBusinessLogo(uid, file);
      await updateBusinessDetails(uid, { logoUrl: url });
      setLogoUrl(url);
    } catch (error) {
      console.error('[BusinessProfileSection] logo', error);
      setLogoError('provider.business.edit.logoError');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <section
      aria-labelledby={`${ID_PREFIX}-title`}
      className="space-y-4 rounded-xl border border-hairline bg-surface-elevated p-4"
    >
      <h2 id={`${ID_PREFIX}-title`} className="text-sm font-medium text-text-tertiary">
        {t('provider.business.edit.title')}
      </h2>

      {loadState === 'loading' && (
        <div className="flex justify-center py-6" aria-busy="true">
          <Spinner size="md" />
        </div>
      )}

      {loadState === 'error' && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-error">
            {t('provider.business.edit.loadError')}
          </p>
          <Button type="button" variant="outline" size="md" className="min-h-11" onClick={() => setLoadAttempt((n) => n + 1)}>
            {t('common.retry')}
          </Button>
        </div>
      )}

      {loadState === 'ready' && (
        <>
          <div>
            <span className="mb-1 block text-xs font-semibold text-content-muted">{t('provider.business.edit.logo')}</span>
            <div className="flex items-center gap-4">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt={t('provider.business.edit.logoAlt')}
                  decoding="async"
                  width={64}
                  height={64}
                  className="h-16 w-16 flex-shrink-0 rounded-lg border border-hairline bg-surface object-contain"
                />
              ) : (
                <div
                  className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface text-content-muted"
                  aria-hidden
                >
                  <Building2 className="h-7 w-7" />
                </div>
              )}
              <div className="space-y-1">
                <input
                  ref={fileInputRef}
                  id={`${ID_PREFIX}-logo`}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoPick}
                  disabled={isUploading}
                  className="sr-only"
                  aria-label={t('provider.business.edit.changeLogo')}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  isLoading={isUploading}
                  loadingText={t('provider.business.edit.logoUploading')}
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-11"
                >
                  <Camera className="mr-2 h-4 w-4" aria-hidden /> {t('provider.business.edit.changeLogo')}
                </Button>
                {logoError && (
                  <p role="alert" className="text-xs text-error">
                    {t(logoError)}
                  </p>
                )}
              </div>
            </div>
          </div>

          <BusinessDetailsForm
            mode="edit"
            idPrefix={ID_PREFIX}
            values={business.values}
            onChange={(next) => {
              business.setValues(next);
              setSaveStatus('idle');
            }}
            errors={business.errors}
            onClearError={business.clearError}
            disabled={isSaving}
          />

          <div aria-live="polite">
            {saveStatus === 'saved' && (
              <p role="status" className="text-sm text-success">
                {t('provider.business.edit.saved')}
              </p>
            )}
            {saveStatus === 'error' && (
              <p role="alert" className="text-sm text-error">
                {t('provider.business.edit.error')}
              </p>
            )}
          </div>

          <Button
            type="button"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={isSaving}
            onClick={handleSave}
            className="min-h-11"
          >
            {t('provider.business.edit.save')}
          </Button>
        </>
      )}
    </section>
  );
}

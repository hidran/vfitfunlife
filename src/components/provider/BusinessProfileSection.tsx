'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { Building2, Camera, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThumbnailImage } from '@/components/gallery/ThumbnailImage';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/hooks/useI18n';
import { useBusinessDetails, useUpdateBusinessDetails } from '@/hooks/useBusinessProfile';
import { uploadGalleryPhoto } from '@/lib/firebase/photos';
import {
  businessFormValues,
  isAcceptableLogoUrl,
  type BusinessDisplayChanges,
} from '@/lib/businessDetails';
import { cn } from '@/lib/utils';
import type { BusinessDetails } from '@/types/firebase';
import { BusinessDetailsForm, type BusinessDetailsFormHandle } from './BusinessDetailsForm';

export interface BusinessProfileSectionHandle {
  /**
   * Save the pending changes. Resolves true when they were saved or there were none, false
   * when a field is invalid or the write failed — the section then shows why.
   */
  save: () => Promise<boolean>;
}

export interface BusinessProfileSectionProps {
  /** True while something differs from what is stored (for the page's unsaved-changes guard). */
  onDirtyChange?: (dirty: boolean) => void;
  className?: string;
}

/**
 * The company profile of a business provider on the profile editor (plan 2026-10-04, B6).
 *
 * Shown only to a company: `users/{uid}.providerType === 'business'` AND an
 * `instructors/{uid}.business` map. The reviewed fields (legal name, tax id, legal form,
 * affiliation number) are read-only; the public name, logo, city, website and description are
 * saved straight to `instructors/{uid}` — only the changed keys, and the public name mirrored to
 * `name`/`fullName`. The user's own personal name (`users/{uid}.fullName`) is left alone.
 */
export const BusinessProfileSection = forwardRef<BusinessProfileSectionHandle, BusinessProfileSectionProps>(
  function BusinessProfileSection({ onDirtyChange, className }, ref) {
    const { t } = useI18n();
    const uid = useAuthStore((s) => s.user?.uid);
    const isBusiness = useAuthStore((s) => s.user?.providerType === 'business');
    const providerStatus = useAuthStore((s) => s.user?.providerStatus);
    const { data: details, isLoading, isError } = useBusinessDetails(isBusiness ? uid : undefined);

    if (!uid || !isBusiness) return null;
    if (isLoading) {
      return (
        <p className={cn('text-sm text-content-muted', className)} role="status">
          {t('common.loading')}
        </p>
      );
    }
    if (isError) {
      return (
        <p className={cn('text-sm text-error break-words', className)} role="alert">
          {t('provider.business.edit.loadError')}
        </p>
      );
    }
    if (!details) return null;
    return (
      <BusinessProfileEditor
        ref={ref}
        uid={uid}
        details={details}
        reviewStatus={
          providerStatus === 'verified' ? 'verified' : providerStatus === 'rejected' ? 'rejected' : 'pending'
        }
        onDirtyChange={onDirtyChange}
        className={className}
      />
    );
  }
);

interface BusinessProfileEditorProps extends BusinessProfileSectionProps {
  uid: string;
  /** The stored company profile; after a save the query cache holds the new values. */
  details: BusinessDetails;
  reviewStatus: 'verified' | 'pending' | 'rejected';
}

type SaveStatus = 'idle' | 'saved' | 'noChanges' | 'error' | 'waitUpload' | 'waitSaving';

const BusinessProfileEditor = forwardRef<BusinessProfileSectionHandle, BusinessProfileEditorProps>(
  function BusinessProfileEditor({ uid, details, reviewStatus, onDirtyChange, className }, ref) {
    const { t } = useI18n();
    const ids = useId();
    const formRef = useRef<BusinessDetailsFormHandle>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const savingRef = useRef(false);
    const alertRef = useRef<HTMLDivElement>(null);
    // The form reads its values once; later cache updates must not reset what is being typed.
    const [defaultValues] = useState(() => businessFormValues(details));
    const update = useUpdateBusinessDetails(uid);

    const savedLogoUrl = details.logoUrl ?? null;
    const [logoUrl, setLogoUrl] = useState<string | null>(savedLogoUrl);
    const [uploading, setUploading] = useState(false);
    const [logoFailed, setLogoFailed] = useState(false);
    const [formDirty, setFormDirty] = useState(false);
    const [status, setStatus] = useState<SaveStatus>('idle');

    const logoDirty = logoUrl !== savedLogoUrl;
    const dirty = formDirty || logoDirty;
    const busy = uploading || update.isPending;

    useEffect(() => {
      onDirtyChange?.(dirty);
      return () => onDirtyChange?.(false);
    }, [dirty, onDirtyChange]);

    const save = useCallback(async (): Promise<boolean> => {
      const form = formRef.current;
      if (!form) return false;
      // The page's Save can arrive while the section is busy: say why nothing was saved
      // instead of leaving a bare failure (the message is in the alert region below).
      if (uploading) {
        setStatus('waitUpload');
        return false;
      }
      if (savingRef.current) {
        setStatus('waitSaving');
        return false;
      }
      savingRef.current = true;
      setStatus('idle');
      try {
        const changes: BusinessDisplayChanges | null = await form.validateChanges();
        if (!changes) return false; // the errors are on their fields, the first one focused
        if (logoDirty) changes.logoUrl = logoUrl;
        if (Object.keys(changes).length === 0) {
          // E.g. only spaces were added: show the values as stored, the form is clean again.
          form.markSaved();
          setStatus('noChanges');
          return true;
        }
        await update.mutateAsync(changes);
        form.markSaved();
        setStatus('saved');
        return true;
      } catch (error) {
        // permission-denied (rules), not-found, network…: one localised message, never the
        // raw code. The details are in the console.
        console.error('[BusinessProfileSection] save failed', error);
        setStatus('error');
        return false;
      } finally {
        savingRef.current = false;
      }
    }, [uploading, logoDirty, logoUrl, update]);

    useImperativeHandle(ref, () => ({ save }), [save]);

    // The "wait" messages go away once the thing they wait for is done, and take the focus
    // while shown so a keyboard / screen-reader user lands on the explanation.
    useEffect(() => {
      if (!uploading && status === 'waitUpload') setStatus('idle');
    }, [uploading, status]);
    useEffect(() => {
      if (status === 'waitUpload' || status === 'waitSaving') alertRef.current?.focus();
    }, [status]);

    const onPickLogo = async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      setLogoFailed(false);
      // Some pickers report no type at all; the compression step then decides. A known
      // non-image type is refused before anything is uploaded.
      if (file.type && !file.type.startsWith('image/')) {
        setLogoFailed(true);
        return;
      }
      setUploading(true);
      try {
        // The instructor's gallery folder: storage.rules already let the owner write images
        // there. The URL is only stored once the section is saved.
        const url = await uploadGalleryPhoto({ scope: 'instructors', entityId: uid, file });
        // The rules accept only an https URL (a Storage download URL); anything else would
        // fail on save with a less helpful message.
        if (!isAcceptableLogoUrl(url)) throw new Error(`not an acceptable logo URL: ${url}`);
        setLogoUrl(url);
      } catch (error) {
        console.error('[BusinessProfileSection] logo upload failed', error);
        setLogoFailed(true);
      } finally {
        setUploading(false);
      }
    };

    const logoHintId = `${ids}-logo-hint`;
    const logoErrorId = `${ids}-logo-error`;
    const logoField = (
      <div className="min-w-0 space-y-1.5">
        <span id={`${ids}-logo-label`} className="block text-sm font-medium text-content break-words">
          {t('provider.business.logo.label')}
        </span>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-hairline bg-content/5">
            {logoUrl ? (
              <ThumbnailImage
                src={logoUrl}
                alt={t('provider.business.logo.alt', { name: details.displayName })}
                width={64}
                height={64}
                className="h-full w-full object-cover"
              />
            ) : (
              <Building2 className="h-6 w-6 text-content-muted" aria-hidden />
            )}
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="min-h-[44px]"
              onClick={() => fileInputRef.current?.click()}
              isLoading={uploading}
              loadingText={t('gallery.uploading')}
              aria-describedby={logoFailed ? `${logoHintId} ${logoErrorId}` : logoHintId}
            >
              <Camera className="mr-2 h-4 w-4" aria-hidden />
              {t(logoUrl ? 'provider.business.logo.change' : 'provider.business.logo.upload')}
            </Button>
            {logoUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-[44px]"
                onClick={() => {
                  setLogoFailed(false);
                  setLogoUrl(null);
                }}
                disabled={uploading}
              >
                {t('provider.business.logo.remove')}
              </Button>
            )}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          tabIndex={-1}
          aria-labelledby={`${ids}-logo-label`}
          data-testid="business-logo-input"
          onChange={onPickLogo}
        />
        <p id={logoHintId} className="text-xs text-content-muted break-words">
          {t('provider.business.logo.hint')}
        </p>
        <div aria-live="polite">
          {logoFailed && (
            <p id={logoErrorId} className="text-sm text-error break-words">
              {t('provider.business.logo.uploadError')}
            </p>
          )}
        </div>
      </div>
    );

    return (
      <section className={cn('min-w-0', className)} data-testid="business-profile-section">
        <form
          noValidate
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <BusinessDetailsForm
            ref={formRef}
            mode="edit"
            defaultValues={defaultValues}
            reviewStatus={reviewStatus}
            disabled={update.isPending}
            logo={logoField}
            onDirtyChange={setFormDirty}
          />
          <Button
            type="submit"
            fullWidth
            isLoading={update.isPending}
            loadingText={t('profile.edit.saveStatus.saving')}
            disabled={busy}
          >
            {t('provider.business.edit.save')}
          </Button>
          <div role="status" aria-live="polite" className="text-sm break-words">
            {status === 'saved' && !dirty && (
              <p className="flex items-center gap-1 text-success-DEFAULT">
                <Check className="h-4 w-4 flex-shrink-0" aria-hidden />
                {t('provider.business.edit.saved')}
              </p>
            )}
            {status === 'noChanges' && !dirty && (
              <p className="text-content-muted">{t('provider.business.edit.noChanges')}</p>
            )}
          </div>
          <div ref={alertRef} tabIndex={-1} role="alert" className="text-sm break-words outline-none">
            {status === 'error' && <p className="text-error">{t('provider.business.edit.error')}</p>}
            {status === 'waitUpload' && <p className="text-error">{t('provider.business.edit.waitUpload')}</p>}
            {status === 'waitSaving' && <p className="text-content-muted">{t('provider.business.edit.waitSaving')}</p>}
          </div>
        </form>
      </section>
    );
  }
);

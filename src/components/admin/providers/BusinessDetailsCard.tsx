'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/Modal';
import { fetchProvider } from '@/lib/firebase/providers';
import { safeHttpUrl } from '@/lib/businessDetails';
import { releaseBusinessVat } from '@/lib/firebase/functions';
import { queryKeys } from '@/lib/queryKeys';
import { notify } from '@/lib/notify';
import { useI18n } from '@/hooks/useI18n';
import type { BusinessDetails } from '@/types/firebase';
import { Building2, ExternalLink, Unlock } from 'lucide-react';

/** Message key for the venue type a company declared (the venues list's own labels). */
export function venueTypeKey(type: BusinessDetails['venueType']) {
  switch (type ?? 'gym') {
    case 'none':
      return 'admin.providerDetail.business.venueTypeNone' as const;
    case 'school':
      return 'admin.venues.filter.school' as const;
    case 'studio':
      return 'admin.venues.filter.studio' as const;
    default:
      return 'admin.venues.filter.gym' as const;
  }
}

/** The release callable's failures that have a message of their own. */
function releaseErrorKey(error: unknown) {
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  if (code === 'functions/not-found') return 'admin.providerDetail.business.releaseVatNotFound' as const;
  if (message === 'business_vat_missing') return 'admin.providerDetail.business.releaseVatMissing' as const;
  return 'admin.providerDetail.actionError' as const;
}

interface Props {
  providerId: string;
  /** Verified companies are live: releasing their P.IVA lets another company claim it. */
  isVerified: boolean;
}

/**
 * Company details of a business provider (instructors/{uid}.business, which the users doc
 * this screen is built from does not carry), with the admin action that frees the P.IVA
 * uniqueness claim. Only the claim goes (releaseBusinessVat): the number stays on the
 * profile, so the block looks the same afterwards and the action is safe to repeat.
 */
export function BusinessDetailsCard({ providerId, isVerified }: Props) {
  const { t } = useI18n();
  const {
    data: instructor,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: queryKeys.adminProviderBusiness(providerId),
    queryFn: () => fetchProvider(providerId),
  });
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [releaseReason, setReleaseReason] = useState('');
  const [releasing, setReleasing] = useState(false);

  const business = instructor?.business;
  const na = t('admin.providerDetail.field.naValue');
  // Owners write business.website directly; a non-http(s) value is shown but never linked.
  const websiteHref = safeHttpUrl(business?.website);

  const handleRelease = async () => {
    setReleasing(true);
    try {
      const result = await releaseBusinessVat({
        providerId,
        ...(releaseReason.trim() ? { reason: releaseReason.trim() } : {}),
      });
      notify.success(
        t(
          result.released
            ? 'admin.providerDetail.business.releaseVatReleased'
            : 'admin.providerDetail.business.releaseVatAlreadyFree',
        ),
      );
      setReleaseOpen(false);
      setReleaseReason('');
      await refetch();
    } catch (error) {
      console.error('Failed to release business VAT claim:', error);
      notify.error(t(releaseErrorKey(error)));
    } finally {
      setReleasing(false);
    }
  };

  return (
    <section
      aria-labelledby="provider-business-title"
      className="bg-surface rounded-2xl border border-hairline p-6 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2
          id="provider-business-title"
          className="flex items-center gap-2 text-lg font-semibold text-content"
        >
          <Building2 className="w-5 h-5 text-content-muted" />
          {t('admin.providerDetail.business.title')}
        </h2>
        {business?.vatNumber && (
          <Button
            variant="secondary"
            onClick={() => setReleaseOpen(true)}
            className="flex items-center gap-2"
          >
            <Unlock className="w-4 h-4" />
            {t('admin.providerDetail.business.releaseVat')}
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-content-muted">{t('common.loading')}</p>
      ) : !business ? (
        <p className="text-sm text-content-muted">{t('admin.providerDetail.business.notFound')}</p>
      ) : (
        <div className="flex flex-col md:flex-row gap-6">
          {business.logoUrl && (
            <Image
              src={business.logoUrl}
              alt={t('admin.providerDetail.business.logo')}
              width={96}
              height={96}
              unoptimized
              className="w-24 h-24 rounded-2xl object-cover border border-hairline flex-shrink-0"
            />
          )}
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 min-w-0">
            <BusinessField label={t('admin.providerDetail.business.legalName')} value={business.legalName || na} />
            <BusinessField label={t('admin.providerDetail.business.vatNumber')} value={business.vatNumber || na} mono />
            <BusinessField label={t('admin.providerDetail.business.displayName')} value={business.displayName || na} />
            <BusinessField label={t('admin.providerDetail.business.venueType')} value={t(venueTypeKey(business.venueType))} />
            <BusinessField label={t('admin.providerDetail.business.address')} value={business.address || na} />
            <BusinessField label={t('admin.providerDetail.business.city')} value={business.city || na} />
            <BusinessField label={t('admin.providerDetail.business.website')}>
              {websiteHref ? (
                <a
                  href={websiteHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-[#00C9FF] light:text-cyan-700 hover:underline break-all"
                >
                  {business.website}
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                </a>
              ) : (
                <span className="text-sm text-content break-all">{business.website || na}</span>
              )}
            </BusinessField>
          </dl>
        </div>
      )}

      {releaseOpen && business?.vatNumber && (
        <Modal
          onClose={() => !releasing && setReleaseOpen(false)}
          closeOnBackdrop={!releasing}
          labelledBy="release-vat-title"
          describedBy="release-vat-warning"
          className="w-full max-w-md"
        >
          <div className="rounded-2xl bg-surface border border-hairline p-6 space-y-4">
            <h2 id="release-vat-title" className="text-lg font-semibold text-content">
              {t('admin.providerDetail.business.releaseVatTitle')}
            </h2>
            <p id="release-vat-warning" className="text-sm text-content-muted">
              {t('admin.providerDetail.business.releaseVatWarning', { vat: business.vatNumber })}
            </p>
            {isVerified && (
              <p
                role="alert"
                className="text-sm rounded-lg border border-[#F59E0B]/40 bg-[#F59E0B]/10 text-content px-3 py-2"
              >
                {t('admin.providerDetail.business.releaseVatVerifiedWarning')}
              </p>
            )}
            <label className="block space-y-1">
              <span className="text-xs text-content-muted">
                {t('admin.providerDetail.business.releaseVatReason')}
              </span>
              <textarea
                value={releaseReason}
                onChange={(e) => setReleaseReason(e.target.value)}
                rows={2}
                maxLength={500}
                className="w-full rounded-lg bg-surface-sunken border border-hairline px-3 py-2 text-content"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setReleaseOpen(false)} disabled={releasing}>
                {t('common.cancel')}
              </Button>
              <Button variant="primary" onClick={handleRelease} disabled={releasing}>
                {releasing ? t('common.loading') : t('admin.providerDetail.business.releaseVatConfirm')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

function BusinessField({
  label,
  value,
  mono,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-content-faint">{label}</dt>
      <dd className={`text-sm text-content break-words ${mono ? 'font-mono' : ''}`}>
        {children ?? value}
      </dd>
    </div>
  );
}

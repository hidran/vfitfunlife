'use client';

import { useId, type ReactNode } from 'react';
import Image from 'next/image';
import { BusinessBadge, BusinessWebsiteLink } from '@/components/provider/BusinessBadge';
import { useI18n } from '@/hooks/useI18n';
import type { MessageKey } from '@/i18n/messages';
import type { AdminBusiness } from '@/lib/admin/providerBusiness';
import type { BusinessLegalForm } from '@/types/firebase';
import { cn } from '@/lib/utils';

export const LEGAL_FORM_LABEL: Record<BusinessLegalForm, MessageKey> = {
  company: 'provider.business.legalForm.company',
  sole_trader: 'provider.business.legalForm.soleTrader',
  association: 'provider.business.legalForm.association',
  other: 'provider.business.legalForm.other',
};

interface Props {
  business: AdminBusiness;
  /** Admin actions, rendered under the details. */
  children?: ReactNode;
  className?: string;
}

/**
 * Everything an admin reviews about a company (plan 2026-10-04, B8): the legal fields first —
 * these are what an approval confirms and sends back as `expectedReview` — then the public
 * ones. The website is a link only when it is http(s) (re-checked by BusinessWebsiteLink).
 */
export function BusinessReviewCard({ business, children, className }: Props) {
  const { t } = useI18n();
  const titleId = useId();
  const none = t('admin.providerDetail.field.naValue');
  const show = (value: string) => (value.trim() ? value : none);

  const rows: { label: string; value: ReactNode; wide?: boolean }[] = [
    { label: t('provider.business.reviewed.legalName'), value: show(business.legalName) },
    {
      label: t('provider.business.reviewed.vatNumber'),
      value: <span className="font-mono tabular-nums">{show(business.vatNumber)}</span>,
    },
    {
      label: t('provider.business.reviewed.legalForm'),
      value: business.legalForm ? t(LEGAL_FORM_LABEL[business.legalForm]) : none,
    },
    { label: t('provider.business.reviewed.affiliationNumber'), value: show(business.affiliationNumber) },
    { label: t('admin.business.field.displayName'), value: show(business.displayName) },
    { label: t('admin.business.field.city'), value: show(business.city) },
    {
      label: t('admin.business.field.website'),
      value: business.website ? (
        <BusinessWebsiteLink website={business.website} className="text-section-primary" />
      ) : (
        none
      ),
    },
    { label: t('admin.business.field.description'), value: show(business.description), wide: true },
  ];

  return (
    <section
      aria-labelledby={titleId}
      className={cn('bg-surface rounded-2xl border border-hairline p-4 sm:p-6 space-y-4', className)}
    >
      <div className="flex flex-wrap items-center gap-3">
        {business.logoUrl && (
          <Image
            src={business.logoUrl}
            alt={t('provider.business.logo.alt', { name: business.displayName || business.legalName })}
            width={48}
            height={48}
            unoptimized
            className="w-12 h-12 rounded-xl object-cover border border-hairline"
          />
        )}
        <h2 id={titleId} className="text-lg font-semibold text-content">
          {t('admin.business.title')}
        </h2>
        <BusinessBadge />
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        {rows.map((row) => (
          <div key={row.label} className={cn('min-w-0', row.wide && 'sm:col-span-2')}>
            <dt className="text-xs text-content-faint">{row.label}</dt>
            <dd className="text-sm text-content break-words whitespace-pre-line">{row.value}</dd>
          </div>
        ))}
      </dl>

      {children}
    </section>
  );
}

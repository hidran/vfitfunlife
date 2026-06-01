'use client';

import type { User } from '@/types/firebase';
import type { AdminProvider, VerificationDocument } from '@/types/admin';
import { useI18n } from '@/hooks/useI18n';
import { formatDate, formatPrice, toDate } from '@/lib/utils';
import { ProviderFormView, type ProviderFormData } from './ProviderFormView';
import {
  Briefcase,
  Award,
  FileText,
  Calendar,
  Star,
  ExternalLink,
} from 'lucide-react';

export type ProviderTab = 'overview' | 'documents' | 'bookings' | 'reviews';

interface TabBarProps {
  active: ProviderTab;
  onChange: (tab: ProviderTab) => void;
}

export function ProviderTabBar({ active, onChange }: TabBarProps) {
  const { t } = useI18n();
  const tabs: { id: ProviderTab; label: string; icon: typeof Briefcase }[] = [
    { id: 'overview', label: t('admin.providerDetail.tab.overview'), icon: Briefcase },
    { id: 'documents', label: t('admin.providerDetail.tab.documents'), icon: FileText },
    { id: 'bookings', label: t('admin.providerDetail.tab.bookings'), icon: Calendar },
    { id: 'reviews', label: t('admin.providerDetail.tab.reviews'), icon: Star },
  ];
  return (
    <div className="border-b border-hairline">
      <div className="flex gap-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              active === tab.id
                ? 'text-[#00C9FF] border-[#00C9FF]'
                : 'text-content-muted border-transparent hover:text-content'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface ContentProps {
  provider: AdminProvider;
  activeTab: ProviderTab;
  editing: boolean;
  onSubmitForm: (data: ProviderFormData) => void;
}

export function ProviderTabContent({
  provider,
  activeTab,
  editing,
  onSubmitForm,
}: ContentProps) {
  const { t } = useI18n();
  const profile = provider.providerProfile;

  if (activeTab === 'documents') {
    const docs: VerificationDocument[] = provider.verificationDocuments ?? [];
    return (
      <div className="bg-surface rounded-2xl border border-hairline p-6">
        <h3 className="text-lg font-semibold text-content mb-4">
          {t('admin.providerDetail.verificationDocuments')}
        </h3>
        {docs.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {docs.map((doc) => (
              <a
                key={doc.id}
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 p-4 bg-surface-sunken rounded-xl hover:bg-surface-sunken transition-colors group"
              >
                <div className="w-12 h-12 rounded-xl bg-[#00C9FF]/20 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-[#00C9FF]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-content truncate">{doc.name}</p>
                  <p className="text-sm text-content-muted capitalize">{doc.type}</p>
                  <p className="text-xs text-content-faint">
                    {t('admin.providerDetail.documentUploadedPrefix')}{' '}
                    {formatDate(toDate(doc.uploadedAt) || new Date())}
                  </p>
                </div>
                <ExternalLink className="w-5 h-5 text-content-faint group-hover:text-content" />
              </a>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-content-faint mx-auto mb-4" />
            <p className="text-content-muted">{t('admin.providerDetail.noDocuments')}</p>
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'bookings') {
    return (
      <div className="bg-surface rounded-2xl border border-hairline p-8 text-center">
        <Calendar className="w-12 h-12 text-content-faint mx-auto mb-4" />
        <p className="text-content-muted">{t('admin.providerDetail.bookingsPlaceholder')}</p>
      </div>
    );
  }

  if (activeTab === 'reviews') {
    return (
      <div className="bg-surface rounded-2xl border border-hairline p-8 text-center">
        <Star className="w-12 h-12 text-content-faint mx-auto mb-4" />
        <p className="text-content-muted">{t('admin.providerDetail.reviewsPlaceholder')}</p>
      </div>
    );
  }

  // overview
  return (
    <>
      {/* Account Information (form: view OR edit) */}
      <div className="bg-surface rounded-2xl border border-hairline p-6">
        <h3 className="text-lg font-semibold text-content mb-4">
          {t('admin.providerDetail.accountInfo')}
        </h3>
        <ProviderFormView
          mode={editing ? 'edit' : 'view'}
          initial={provider as User}
          onSubmit={onSubmitForm}
        />
      </div>

      {/* Bio + Certifications + Services + Languages */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Professional Bio */}
        <div className="bg-surface rounded-2xl border border-hairline p-6">
          <h3 className="text-lg font-semibold text-content mb-4">
            {t('admin.providerDetail.professionalBio')}
          </h3>
          <p className="text-content-muted whitespace-pre-wrap">
            {profile?.professionalBio || t('admin.providerDetail.noBio')}
          </p>
        </div>

        {/* Certifications */}
        <div className="bg-surface rounded-2xl border border-hairline p-6">
          <h3 className="text-lg font-semibold text-content mb-4">
            {t('admin.providerDetail.certifications')}
          </h3>
          {profile?.certifications && profile.certifications.length > 0 ? (
            <div className="space-y-3">
              {profile.certifications.map((cert) => (
                <div
                  key={cert.id}
                  className="flex items-start gap-3 p-3 bg-surface-sunken rounded-xl"
                >
                  <Award className="w-5 h-5 text-[#00C9FF] flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-content">{cert.name}</p>
                    <p className="text-sm text-content-muted">{cert.issuingOrganization}</p>
                    <p className="text-xs text-content-faint mt-1">
                      {t('admin.providerDetail.certIssuedPrefix')}{' '}
                      {formatDate(toDate(cert.issueDate) || new Date())}
                      {cert.expiryDate &&
                        ` ${t('admin.providerDetail.certExpiresPrefix')} ${formatDate(
                          toDate(cert.expiryDate) || new Date(),
                        )}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-content-muted">{t('admin.providerDetail.noCertifications')}</p>
          )}
        </div>

        {/* Services */}
        <div className="bg-surface rounded-2xl border border-hairline p-6">
          <h3 className="text-lg font-semibold text-content mb-4">
            {t('admin.providerDetail.services')}
          </h3>
          {profile?.servicePricing && profile.servicePricing.length > 0 ? (
            <div className="space-y-3">
              {profile.servicePricing.map((service) => (
                <div
                  key={service.id}
                  className="flex items-center justify-between p-3 bg-surface-sunken rounded-xl"
                >
                  <div>
                    <p className="font-medium text-content">{service.serviceName}</p>
                    <p className="text-sm text-content-muted">
                      {t('admin.providerDetail.serviceDurationMinutes', {
                        count: String(service.durationMinutes),
                      })}
                    </p>
                  </div>
                  <span className="font-semibold text-content">
                    {formatPrice(service.price)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-content-muted">{t('admin.providerDetail.noServices')}</p>
          )}
        </div>

        {/* Languages */}
        <div className="bg-surface rounded-2xl border border-hairline p-6">
          <h3 className="text-lg font-semibold text-content mb-4">
            {t('admin.providerDetail.languages')}
          </h3>
          {profile?.languages && profile.languages.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {profile.languages.map((lang) => (
                <span
                  key={lang}
                  className="px-3 py-1.5 bg-surface-2 text-content rounded-full text-sm"
                >
                  {lang}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-content-muted">{t('admin.providerDetail.noLanguages')}</p>
          )}
        </div>
      </div>
    </>
  );
}

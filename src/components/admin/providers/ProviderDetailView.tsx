'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, getFunctionsInstance } from '@/lib/firebase/config';
import {
  EntityDetailLayout,
  ConfirmDeleteDialog,
  useEntityMutation,
  VerificationBadge,
  StatusBadge,
  ProviderTypeBadge,
} from '@/components/admin';
import { useFirestoreDocQuery } from '@/hooks/useFirestoreDocQuery';
import { queryKeys } from '@/lib/queryKeys';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { fetchProvider } from '@/lib/firebase/providers';
import { safeHttpUrl } from '@/lib/businessDetails';
import { releaseBusinessVat } from '@/lib/firebase/functions';
import { useAdminStore } from '@/stores/adminStore';
import { useShallow } from 'zustand/react/shallow';
import { notify } from '@/lib/notify';
import { useI18n } from '@/hooks/useI18n';
import { formatDecimal, formatPrice } from '@/lib/utils';
import type { AdminProvider } from '@/types/admin';
import type { BusinessDetails } from '@/types/firebase';
import { type ProviderFormData } from './ProviderFormView';
import {
  ProviderTabBar,
  ProviderTabContent,
  type ProviderTab,
} from './ProviderTabsContent';
import {
  Mail,
  Phone,
  Star,
  Briefcase,
  CheckCircle,
  XCircle,
  Calendar,
  CreditCard,
  TrendingUp,
  Building2,
  ExternalLink,
  Unlock,
} from 'lucide-react';

interface Props {
  providerId: string;
}

export function ProviderDetailView({ providerId }: Props) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { verifyProviderAction, rejectProviderAction } = useAdminStore(
    useShallow((s) => ({
      verifyProviderAction: s.verifyProviderAction,
      rejectProviderAction: s.rejectProviderAction,
    }))
  );
  const qc = useQueryClient();
  const queryKey = queryKeys.adminProvider(providerId);

  const { data: provider, isLoading: loading } = useFirestoreDocQuery<AdminProvider>(
    queryKey,
    'users',
    providerId,
    (id, data) => ({ id, uid: id, ...data } as AdminProvider),
  );
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ProviderTab>('overview');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const updateMut = useEntityMutation<ProviderFormData, void>({
    mutate: async (patch) => {
      const specialties = (patch.specialties ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const updateData: Record<string, unknown> = {
        fullName: patch.fullName,
        email: patch.email || null,
        phone: patch.phone || null,
        bio: patch.bio || null,
        'providerProfile.professionalBio': patch.professionalBio || '',
        'providerProfile.specialties': specialties,
        'providerProfile.yearsOfExperience': Number(patch.yearsOfExperience ?? 0),
        updatedAt: serverTimestamp(),
      };
      await updateDoc(doc(db, 'users', providerId), updateData);
    },
    audit: (patch) => ({
      action: 'update',
      entityType: 'provider',
      entityId: providerId,
      before: (provider ?? undefined) as Record<string, unknown> | undefined,
      after: { ...(provider ?? {}), ...patch } as Record<string, unknown>,
    }),
    invalidateKeys: [['providers'], queryKey],
    onSuccess: (_r, patch) => {
      const specialties = (patch.specialties ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      qc.setQueryData(queryKey, (prev: AdminProvider | null | undefined) => {
        if (!prev) return prev;
        return {
          ...prev,
          fullName: patch.fullName,
          email: patch.email || null,
          phone: patch.phone || null,
          bio: patch.bio || null,
          providerProfile: prev.providerProfile
            ? {
                ...prev.providerProfile,
                professionalBio: patch.professionalBio || '',
                specialties,
                yearsOfExperience: Number(patch.yearsOfExperience ?? 0),
              }
            : prev.providerProfile,
        } as AdminProvider;
      });
      setEditing(false);
    },
  });

  const deleteMut = useEntityMutation<{ reason: string }, void>({
    mutate: async ({ reason }) => {
      const functions = await getFunctionsInstance();
      const fn = httpsCallable(functions, 'adminDeleteProvider');
      await fn({ providerId, reason });
    },
    audit: ({ reason }) => ({
      action: 'delete',
      entityType: 'provider',
      entityId: providerId,
      before: (provider ?? undefined) as Record<string, unknown> | undefined,
      reason,
    }),
    invalidateKeys: [['providers']],
    onSuccess: () => router.push('/admin/providers/'),
  });

  const handleVerify = async () => {
    if (!provider) return;
    try {
      await verifyProviderAction(provider.id, {
        status: 'verified',
        verifiedAt: Timestamp.now(),
      });
      qc.setQueryData(queryKey, (prev: AdminProvider | null | undefined) =>
        prev
          ? {
              ...prev,
              // providerStatus is what the provider's own app reads; showing only the
              // nested verification flag here is how this screen used to look approved
              // while they were still stuck on "pending".
              providerStatus: 'verified',
              providerProfile: prev.providerProfile
                ? { ...prev.providerProfile, isVerified: true }
                : prev.providerProfile,
            }
          : prev,
      );
      notify.success(t('admin.providerDetail.verifiedSuccess'));
    } catch (error) {
      console.error('Failed to verify provider:', error);
      notify.error(t('admin.providerDetail.actionError'));
    }
  };

  const handleReject = async () => {
    if (!provider || !rejectReason.trim()) return;
    try {
      await rejectProviderAction(provider.id, rejectReason);
      setShowRejectForm(false);
      setRejectReason('');
      notify.success(t('admin.providerDetail.rejectedSuccess'));
    } catch (error) {
      console.error('Failed to reject provider:', error);
      notify.error(t('admin.providerDetail.actionError'));
    }
  };

  if (loading) {
    return <div className="p-8 text-content-muted">{t('common.loading')}</div>;
  }
  if (!provider) {
    return (
      <div className="p-8 text-content-muted">{t('admin.providerDetail.notFound')}</div>
    );
  }

  const profile = provider.providerProfile;
  const isSuspended = (provider as AdminProvider & { isSuspended?: boolean })
    .isSuspended;
  const metrics = provider.performanceMetrics;

  return (
    <>
      <EntityDetailLayout
        title={provider.fullName}
        subtitle={provider.email ?? provider.phone ?? ''}
        backHref="/admin/providers/"
        isEditing={editing}
        isSaving={updateMut.isPending}
        onEdit={() => setEditing(true)}
        onCancelEdit={() => setEditing(false)}
        onSave={() =>
          (document.getElementById('provider-form') as HTMLFormElement | null)?.requestSubmit()
        }
        onDelete={() => setConfirmOpen(true)}
      >
        {/* Profile header card */}
        <div className="bg-surface rounded-2xl border border-hairline p-6">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Avatar */}
            <div className="flex-shrink-0">
              {provider.avatarUrl ? (
                <Image
                  src={provider.avatarUrl}
                  alt={provider.fullName}
                  width={96}
                  height={96}
                  unoptimized
                  className="w-24 h-24 rounded-2xl object-cover border border-hairline"
                />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#00C9FF] to-[#7B61FF] flex items-center justify-center text-white text-3xl font-semibold">
                  {provider.fullName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <ProviderTypeBadge userType={provider.userType} />
                    {provider.providerType === 'business' && (
                      <Badge variant="default">{t('provider.badge.business')}</Badge>
                    )}
                    <VerificationBadge isVerified={profile?.isVerified ?? false} />
                    <StatusBadge status={isSuspended ? 'suspended' : 'active'} />
                    {profile?.specialties?.map((specialty) => (
                      <span
                        key={specialty}
                        className="px-2 py-0.5 bg-[#00C9FF]/10 text-[#00C9FF] light:text-cyan-700 text-xs rounded-full"
                      >
                        {specialty}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Verification is admin work now — signup auto-approves, so the back
                    office's job here is reviewing who got listed. The whole /admin area
                    already requires admin or superadmin, and decideProviderApplication
                    enforces the same on the server. */}
                {!profile?.isVerified && (
                  <>
                    <div className="flex gap-2">
                      {!showRejectForm ? (
                        <>
                          <Button
                            variant="secondary"
                            onClick={() => setShowRejectForm(true)}
                            className="flex items-center gap-2 text-[#EF4444] light:text-red-700 hover:text-[#EF4444] light:hover:text-red-700"
                          >
                            <XCircle className="w-4 h-4" />
                            {t('admin.providerDetail.reject')}
                          </Button>
                          <Button
                            variant="primary"
                            onClick={handleVerify}
                            className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800"
                          >
                            <CheckCircle className="w-4 h-4" />
                            {t('admin.providerDetail.verify')}
                          </Button>
                        </>
                      ) : (
                        <div className="flex gap-2">
                          <Button variant="ghost" onClick={() => setShowRejectForm(false)}>
                            {t('admin.providerDetail.cancel')}
                          </Button>
                          <Button
                            variant="primary"
                            onClick={handleReject}
                            disabled={!rejectReason.trim()}
                            className="bg-[#EF4444] hover:bg-[#DC2626]"
                          >
                            {t('admin.providerDetail.confirmReject')}
                          </Button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {showRejectForm && (
                <div className="mt-4 p-4 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl">
                  <label className="block text-sm font-medium text-content mb-2">
                    {t('admin.providerDetail.rejectionReason')}
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder={t('admin.providerDetail.rejectionPlaceholder')}
                    className="w-full px-3 py-2 bg-surface-sunken border border-hairline rounded-lg text-content text-sm placeholder:text-content-faint focus:outline-none focus:border-[#EF4444]/50 resize-none"
                    rows={2}
                  />
                </div>
              )}

              {/* Contact summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                <ContactRow
                  icon={<Mail className="w-5 h-5 text-content-muted" />}
                  label={t('admin.providerDetail.field.email')}
                  value={provider.email || t('admin.providerDetail.field.naValue')}
                />
                <ContactRow
                  icon={<Phone className="w-5 h-5 text-content-muted" />}
                  label={t('admin.providerDetail.field.phone')}
                  value={provider.phone || t('admin.providerDetail.field.naValue')}
                />
                <ContactRow
                  icon={<Star className="w-5 h-5 text-[#F59E0B] light:text-amber-700" />}
                  label={t('admin.providerDetail.field.rating')}
                  value={`${formatDecimal(profile?.rating ?? 0, locale, 1)} ${t(
                    'admin.providerDetail.reviews',
                    { count: String(profile?.reviewCount || 0) },
                  )}`}
                />
                <ContactRow
                  icon={<Briefcase className="w-5 h-5 text-content-muted" />}
                  label={t('admin.providerDetail.field.experience')}
                  value={t('admin.providerDetail.field.experienceYears', {
                    count: String(profile?.yearsOfExperience || 0),
                  })}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Company details live on instructors/{uid}.business, not on the users doc this
            screen is built from; the approve/reject actions above apply to companies too. */}
        {provider.providerType === 'business' && (
          <BusinessDetailsCard providerId={provider.id} />
        )}

        {/* Performance Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            icon={<Calendar className="w-5 h-5 text-[#00C9FF] light:text-cyan-700" />}
            bg="bg-[#00C9FF]/20"
            label={t('admin.providerDetail.stat.totalBookings')}
            value={String(metrics?.totalBookings || 0)}
          />
          <MetricCard
            icon={<CheckCircle className="w-5 h-5 text-[#10B981] light:text-emerald-700" />}
            bg="bg-[#10B981]/20"
            label={t('admin.providerDetail.stat.completionRate')}
            value={`${
              metrics?.totalBookings
                ? Math.round(
                    (metrics.completedBookings / metrics.totalBookings) * 100,
                  )
                : 0
            }%`}
          />
          <MetricCard
            icon={<CreditCard className="w-5 h-5 text-[#7B61FF] light:text-violet-700" />}
            bg="bg-[#7B61FF]/20"
            label={t('admin.providerDetail.stat.totalRevenue')}
            value={formatPrice(metrics?.totalRevenue || 0, locale)}
          />
          <MetricCard
            icon={<TrendingUp className="w-5 h-5 text-[#F59E0B] light:text-amber-700" />}
            bg="bg-[#F59E0B]/20"
            label={t('admin.providerDetail.stat.commissionPaid')}
            value={formatPrice(metrics?.commissionPaid || 0, locale)}
          />
        </div>

        <ProviderTabBar active={activeTab} onChange={setActiveTab} />

        <div className="space-y-6">
          <ProviderTabContent
            provider={provider}
            activeTab={activeTab}
            editing={editing}
            onSubmitForm={(data) => updateMut.mutate(data)}
          />
        </div>
      </EntityDetailLayout>

      <ConfirmDeleteDialog
        open={confirmOpen}
        entityLabel={t('admin.providers.entityLabel')}
        entityName={provider.fullName}
        onClose={() => setConfirmOpen(false)}
        onConfirm={(reason) => deleteMut.mutateAsync({ reason })}
      />
    </>
  );
}

/** Message key for the venue type a company declared (the venues list's own labels). */
function venueTypeKey(type: BusinessDetails['venueType']) {
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

function BusinessDetailsCard({ providerId }: { providerId: string }) {
  const { t } = useI18n();
  const {
    data: instructor,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['admin', 'provider', providerId, 'business'],
    queryFn: () => fetchProvider(providerId),
  });
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [releaseReason, setReleaseReason] = useState('');
  const [releasing, setReleasing] = useState(false);

  const business = instructor?.business;
  const na = t('admin.providerDetail.field.naValue');
  // Owners write business.website directly; a non-http(s) value is shown but never linked.
  const websiteHref = safeHttpUrl(business?.website);

  // Only the uniqueness claim goes (releaseBusinessVat): the number stays on the profile, so
  // the block looks the same afterwards and the action is safe to repeat.
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
      notify.error(t('admin.providerDetail.actionError'));
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

function ContactRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-content-faint">{label}</p>
        <p className="text-sm text-content truncate">{value}</p>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  bg,
  label,
  value,
}: {
  icon: React.ReactNode;
  bg: string;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-surface rounded-xl border border-hairline p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
          {icon}
        </div>
        <div>
          <p className="text-xs text-content-faint">{label}</p>
          <p className="text-xl font-bold text-content">{value}</p>
        </div>
      </div>
    </div>
  );
}

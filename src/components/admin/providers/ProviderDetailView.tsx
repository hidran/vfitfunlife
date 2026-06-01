'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase/config';
import {
  EntityDetailLayout,
  ConfirmDeleteDialog,
  SuperadminOnly,
  useEntityMutation,
  VerificationBadge,
  StatusBadge,
  ProviderTypeBadge,
} from '@/components/admin';
import { Button } from '@/components/ui/button';
import { useAdminStore } from '@/stores/adminStore';
import { notify } from '@/lib/notify';
import { useI18n } from '@/hooks/useI18n';
import { formatPrice } from '@/lib/utils';
import type { AdminProvider } from '@/types/admin';
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
} from 'lucide-react';

interface Props {
  providerId: string;
}

export function ProviderDetailView({ providerId }: Props) {
  const router = useRouter();
  const { t } = useI18n();
  const { verifyProviderAction, rejectProviderAction } = useAdminStore();

  const [provider, setProvider] = useState<AdminProvider | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ProviderTab>('overview');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const snap = await getDoc(doc(db, 'users', providerId));
      if (cancelled) return;
      setProvider(
        snap.exists()
          ? ({ id: snap.id, uid: snap.id, ...snap.data() } as AdminProvider)
          : null,
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [providerId]);

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
    invalidateKeys: [['providers']],
    onSuccess: (_r, patch) => {
      setProvider((prev) => {
        if (!prev) return prev;
        const specialties = (patch.specialties ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
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
      setProvider({
        ...provider,
        providerProfile: provider.providerProfile
          ? { ...provider.providerProfile, isVerified: true }
          : provider.providerProfile,
      });
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
                    <VerificationBadge isVerified={profile?.isVerified ?? false} />
                    <StatusBadge status={isSuspended ? 'suspended' : 'active'} />
                    {profile?.specialties?.map((specialty) => (
                      <span
                        key={specialty}
                        className="px-2 py-0.5 bg-[#00C9FF]/10 text-[#00C9FF] text-xs rounded-full"
                      >
                        {specialty}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Verification actions - superadmin only */}
                {!profile?.isVerified && (
                  <SuperadminOnly>
                    <div className="flex gap-2">
                      {!showRejectForm ? (
                        <>
                          <Button
                            variant="secondary"
                            onClick={() => setShowRejectForm(true)}
                            className="flex items-center gap-2 text-[#EF4444] hover:text-[#EF4444]"
                          >
                            <XCircle className="w-4 h-4" />
                            {t('admin.providerDetail.reject')}
                          </Button>
                          <Button
                            variant="primary"
                            onClick={handleVerify}
                            className="flex items-center gap-2 bg-[#10B981] hover:bg-[#059669]"
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
                  </SuperadminOnly>
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
                  icon={<Star className="w-5 h-5 text-[#F59E0B]" />}
                  label={t('admin.providerDetail.field.rating')}
                  value={`${profile?.rating?.toFixed(1) || '0.0'} ${t(
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

        {/* Performance Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            icon={<Calendar className="w-5 h-5 text-[#00C9FF]" />}
            bg="bg-[#00C9FF]/20"
            label={t('admin.providerDetail.stat.totalBookings')}
            value={String(metrics?.totalBookings || 0)}
          />
          <MetricCard
            icon={<CheckCircle className="w-5 h-5 text-[#10B981]" />}
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
            icon={<CreditCard className="w-5 h-5 text-[#7B61FF]" />}
            bg="bg-[#7B61FF]/20"
            label={t('admin.providerDetail.stat.totalRevenue')}
            value={formatPrice(metrics?.totalRevenue || 0)}
          />
          <MetricCard
            icon={<TrendingUp className="w-5 h-5 text-[#F59E0B]" />}
            bg="bg-[#F59E0B]/20"
            label={t('admin.providerDetail.stat.commissionPaid')}
            value={formatPrice(metrics?.commissionPaid || 0)}
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

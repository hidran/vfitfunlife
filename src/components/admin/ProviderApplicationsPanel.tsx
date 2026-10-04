'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { fetchProviderApplications } from '@/lib/firebase/providers';
import { decideProviderApplication } from '@/lib/firebase/functions';
import type { Provider } from '@/types/instructor';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/stores/authStore';
import { useServiceCategoryMap } from '@/hooks/useServiceCategories';
import { queryKeys } from '@/lib/queryKeys';
import { adminBusinessErrorCode, ADMIN_BUSINESS_ERRORS } from '@/lib/providerApplicationErrors';
import { BusinessBadge } from '@/components/provider/BusinessBadge';
import { useAdminProviderBusiness } from '@/hooks/useAdminProviderBusiness';
import { businessReviewOf, type AdminBusiness } from '@/lib/admin/providerBusiness';

export function ProviderApplicationsPanel() {
  const { t } = useI18n();
  // Verification is admin work, and decideProviderApplication enforces the same server-side.
  // It was superadmin-only, which meant every signup waited on one of two accounts.
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin' || s.user?.role === 'superadmin');
  const categoryMap = useServiceCategoryMap();
  const queryClient = useQueryClient();

  const appsQuery = useQuery({
    queryKey: queryKeys.providerApplications(),
    queryFn: fetchProviderApplications,
  });
  const apps = appsQuery.data ?? [];
  const loading = appsQuery.isPending;

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);

  const decide = async (a: Provider, decision: 'verified' | 'rejected', business: AdminBusiness | null) => {
    setBusyId(a.id);
    setError(null);
    try {
      await decideProviderApplication({
        providerId: a.id,
        decision,
        // A company is approved for the tax id and legal name shown in its row (B8). Read by
        // the admin reader: a map without a public name is still a company to the server.
        ...(decision === 'verified' && business ? { expectedReview: businessReviewOf(business) } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.providerApplications() });
    } catch (e) {
      console.error('[ProviderApplicationsPanel] decide failed', a.id, decision, e);
      const code = adminBusinessErrorCode(e);
      setError({
        id: a.id,
        message: t(code ? ADMIN_BUSINESS_ERRORS[code] : 'admin.applications.error'),
      });
      // The company changed since the list was loaded: show what it is now.
      if (code === 'stale_review' || code === 'review_required') {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.providerApplications() }),
          queryClient.invalidateQueries({ queryKey: queryKeys.adminProviderBusiness(a.id) }),
        ]);
      }
    } finally {
      setBusyId(null);
    }
  };

  const categoryLabels = (a: Provider) =>
    (a.requestedCategoryIds ?? [])
      .map((id) => categoryMap.get(id)?.name ?? id)
      .join(', ');

  return (
    <div className="bg-surface rounded-xl border border-hairline p-4">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-[#F59E0B] light:text-amber-700" />
        <h2 className="text-lg font-semibold text-content">{t('admin.applications.title')}</h2>
        <span className="text-sm text-content-muted">({apps.length})</span>
      </div>

      {!isAdmin && apps.length > 0 && (
        <p className="mb-3 text-sm text-content-muted">{t('admin.applications.adminOnly')}</p>
      )}

      {loading ? (
        <p className="text-content-muted text-sm">{t('admin.applications.loading')}</p>
      ) : apps.length === 0 ? (
        <p className="text-content-muted text-sm">{t('admin.applications.empty')}</p>
      ) : (
        <ul className="space-y-3">
          {apps.map((a) => (
            <ApplicationRow
              key={a.id}
              app={a}
              categories={categoryLabels(a)}
              isAdmin={isAdmin}
              busy={busyId === a.id}
              error={error?.id === a.id ? error.message : null}
              onDecide={decide}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface ApplicationRowProps {
  app: Provider;
  categories: string;
  isAdmin: boolean;
  busy: boolean;
  error: string | null;
  onDecide: (a: Provider, decision: 'verified' | 'rejected', business: AdminBusiness | null) => void;
}

/** One pending application. Its company details come from the admin reader, not the public one. */
function ApplicationRow({ app: a, categories, isAdmin, busy, error, onDecide }: ApplicationRowProps) {
  const { t } = useI18n();
  const businessQuery = useAdminProviderBusiness(a.id);
  const business = businessQuery.data ?? null;
  // Approving waits for the company details: without them the server answers review_required.
  const approveBlocked = busy || businessQuery.isPending;
  return (
    <li className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-hairline p-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-content font-medium">{a.fullName}</p>
          {(business || a.isBusiness) && <BusinessBadge />}
        </div>
        <p className="text-sm text-content-muted">{categories || '—'}</p>
        {/* What an approval of a company confirms (and sends back as expectedReview). */}
        {business && (
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-sm">
            <dt className="text-content-faint">{t('provider.business.reviewed.legalName')}</dt>
            <dd className="text-content break-words">{business.legalName}</dd>
            <dt className="text-content-faint">{t('provider.business.reviewed.vatNumber')}</dt>
            <dd className="text-content font-mono tabular-nums">{business.vatNumber}</dd>
          </dl>
        )}
        {error && <p role="alert" className="text-sm text-[#EF4444] light:text-red-700">{error}</p>}
      </div>
      {isAdmin && (
        <div className="flex gap-2">
          <Button size="sm" disabled={approveBlocked} onClick={() => onDecide(a, 'verified', business)}>
            <CheckCircle className="w-4 h-4 mr-1" /> {t('admin.applications.verify')}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDecide(a, 'rejected', business)}>
            <XCircle className="w-4 h-4 mr-1" /> {t('admin.applications.reject')}
          </Button>
        </div>
      )}
    </li>
  );
}

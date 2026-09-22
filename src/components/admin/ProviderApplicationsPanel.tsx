'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { fetchProviderApplications } from '@/lib/firebase/providers';
import { decideProviderApplication } from '@/lib/firebase/functions';
import type { Provider } from '@/types/instructor';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/stores/authStore';
import { useServiceCategoryMap } from '@/hooks/useServiceCategories';

export function ProviderApplicationsPanel() {
  const { t } = useI18n();
  // Verification is admin work, and decideProviderApplication enforces the same server-side.
  // It was superadmin-only, which meant every signup waited on one of two accounts.
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin' || s.user?.role === 'superadmin');
  const categoryMap = useServiceCategoryMap();
  const [apps, setApps] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setApps(await fetchProviderApplications());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (id: string, decision: 'verified' | 'rejected') => {
    setBusyId(id);
    setErrorId(null);
    try {
      await decideProviderApplication({ providerId: id, decision });
      await load();
    } catch (e) {
      console.error('[ProviderApplicationsPanel] decide failed', id, decision, e);
      setErrorId(id);
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
        <Clock className="w-5 h-5 text-[#F59E0B]" />
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
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-hairline p-3">
              <div className="min-w-0">
                <p className="text-content font-medium">{a.fullName}</p>
                <p className="text-sm text-content-muted">{categoryLabels(a) || '—'}</p>
                {errorId === a.id && (
                  <p className="text-sm text-[#EF4444]">{t('admin.applications.error')}</p>
                )}
              </div>
              {isAdmin && (
                <div className="flex gap-2">
                  <Button size="sm" disabled={busyId === a.id} onClick={() => decide(a.id, 'verified')}>
                    <CheckCircle className="w-4 h-4 mr-1" /> {t('admin.applications.verify')}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busyId === a.id} onClick={() => decide(a.id, 'rejected')}>
                    <XCircle className="w-4 h-4 mr-1" /> {t('admin.applications.reject')}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

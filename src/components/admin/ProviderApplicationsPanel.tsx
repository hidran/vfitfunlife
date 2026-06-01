'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { fetchProviderApplications } from '@/lib/firebase/providers';
import { setProviderApplicationStatus } from '@/lib/firebase/providerApplication';
import type { Provider } from '@/types/instructor';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';

export function ProviderApplicationsPanel() {
  const { t } = useI18n();
  const [apps, setApps] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setApps(await fetchProviderApplications());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (id: string, status: 'verified' | 'rejected') => {
    setBusyId(id);
    try {
      await setProviderApplicationStatus(id, status);
      await load();
    } catch (e) {
      console.error('[ProviderApplicationsPanel] decide failed', id, status, e);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-surface rounded-xl border border-hairline p-4">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-[#F59E0B]" />
        <h2 className="text-lg font-semibold text-content">{t('admin.applications.title')}</h2>
        <span className="text-sm text-content-muted">({apps.length})</span>
      </div>

      {loading ? (
        <p className="text-content-muted text-sm">{t('admin.applications.loading')}</p>
      ) : apps.length === 0 ? (
        <p className="text-content-muted text-sm">{t('admin.applications.empty')}</p>
      ) : (
        <ul className="space-y-3">
          {apps.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-4 rounded-lg border border-hairline p-3">
              <div>
                <p className="text-content font-medium">{a.fullName}</p>
                <p className="text-sm text-content-muted">{a.specialties.join(', ') || '—'}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" disabled={busyId === a.id} onClick={() => decide(a.id, 'verified')}>
                  <CheckCircle className="w-4 h-4 mr-1" /> {t('admin.applications.verify')}
                </Button>
                <Button size="sm" variant="ghost" disabled={busyId === a.id} onClick={() => decide(a.id, 'rejected')}>
                  <XCircle className="w-4 h-4 mr-1" /> {t('admin.applications.reject')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

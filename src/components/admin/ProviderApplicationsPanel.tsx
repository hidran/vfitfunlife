'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { fetchProviderApplications } from '@/lib/firebase/providers';
import { setProviderApplicationStatus } from '@/lib/firebase/providerApplication';
import type { Provider } from '@/types/instructor';
import { Button } from '@/components/ui/button';

export function ProviderApplicationsPanel() {
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
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-[#1E2230] rounded-xl border border-white/10 p-4">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-[#F59E0B]" />
        <h2 className="text-lg font-semibold text-white">Richieste in attesa</h2>
        <span className="text-sm text-white/50">({apps.length})</span>
      </div>

      {loading ? (
        <p className="text-white/50 text-sm">Caricamento…</p>
      ) : apps.length === 0 ? (
        <p className="text-white/50 text-sm">Nessuna richiesta in attesa.</p>
      ) : (
        <ul className="space-y-3">
          {apps.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-4 rounded-lg border border-white/10 p-3">
              <div>
                <p className="text-white font-medium">{a.fullName}</p>
                <p className="text-sm text-white/50">{a.specialties.join(', ') || '—'}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" disabled={busyId === a.id} onClick={() => decide(a.id, 'verified')}>
                  <CheckCircle className="w-4 h-4 mr-1" /> Verifica
                </Button>
                <Button size="sm" variant="ghost" disabled={busyId === a.id} onClick={() => decide(a.id, 'rejected')}>
                  <XCircle className="w-4 h-4 mr-1" /> Rifiuta
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

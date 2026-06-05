'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { Search, UserCircle, ChevronRight } from 'lucide-react';
import { db } from '@/lib/firebase/config';
import { Spinner } from '@/components/ui/Spinner';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';

interface AdminClientRow {
  id: string;
  name: string;
  email: string;
  phone?: string;
  photoUrl?: string;
  totalBookings?: number;
  totalSpent?: number;
  lastVisit?: Date;
}

export default function AdminClientsList() {
  const { t, locale } = useI18n();
  const [clients, setClients] = useState<AdminClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const snap = await getDocs(
          query(collection(db, 'clients'), orderBy('lastVisit', 'desc'))
        );
        if (cancelled) return;
        setClients(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              name: data.name ?? '',
              email: data.email ?? '',
              phone: data.phone,
              photoUrl: data.photoUrl,
              totalBookings: data.totalBookings,
              totalSpent: data.totalSpent,
              lastVisit: data.lastVisit?.toDate?.(),
            } as AdminClientRow;
          })
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    );
  }, [clients, search]);

  const formatDate = (date?: Date) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString(toLocaleTag(locale), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-content">{t('admin.clients.title')}</h1>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('admin.clients.search')}
          className="w-full sm:max-w-md bg-surface-input border border-hairline rounded-lg pl-10 pr-3 py-2 text-sm text-content placeholder-gray-500 outline-none focus:border-section-primary"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="md" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-content-muted text-sm py-8">{t('admin.clients.empty')}</p>
      ) : (
        <div className="bg-surface rounded-xl border border-hairline divide-y divide-hairline overflow-hidden">
          {filtered.map((c) => (
            <Link
              key={c.id}
              href={`/provider/clients/detail?id=${c.id}`}
              className="flex items-center gap-4 p-4 hover:bg-surface-2 transition-colors"
            >
              {c.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.photoUrl}
                  alt={c.name}
                  className="w-10 h-10 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-surface-input flex items-center justify-center shrink-0">
                  <UserCircle className="w-6 h-6 text-content-muted" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-content truncate">{c.name || '—'}</p>
                <p className="text-sm text-content-muted truncate">{c.email}</p>
              </div>
              <div className="hidden sm:block text-right text-sm text-content-muted shrink-0">
                <p>{t('admin.clients.lastVisit')}: {formatDate(c.lastVisit)}</p>
                {c.totalBookings != null && (
                  <p>
                    {c.totalBookings} {t('admin.clients.bookings')}
                  </p>
                )}
              </div>
              <ChevronRight className="w-5 h-5 text-content-muted shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

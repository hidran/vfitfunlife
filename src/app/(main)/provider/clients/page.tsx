'use client';

import { useState, useEffect } from 'react';
import { Search, Users, Calendar, DollarSign, ChevronRight, FileText } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { useProviderStore } from '@/stores/providerStore';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';
import { ProviderClient } from '@/types/provider';
import Link from 'next/link';

// Real data is fetched from Firestore via providerStore

export default function ProviderClientsPage() {
  const { t, locale } = useI18n();
  const { clients, isLoadingClients, fetchClients } = useProviderStore();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // Use real data from Firestore
  const displayClients = clients;

  const filteredClients = displayClients.filter(client =>
    client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (date?: Date) => {
    if (!date) return t('provider.clients.never');
    return new Date(date).toLocaleDateString(toLocaleTag(locale), {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content">{t('provider.clients.title')}</h1>
          <p className="text-gray-400 mt-1">
            {t('provider.clients.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-2xl font-bold text-content">{displayClients.length}</p>
            <p className="text-sm text-gray-400">{t('provider.clients.totalClients')}</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder={t('provider.clients.search.placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface-elevated border border-hairline rounded-lg pl-10 pr-4 py-2.5 text-content placeholder-gray-500 outline-none focus:border-section-primary"
          />
        </div>
      </div>

      {/* Clients Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredClients.map((client) => (
          <Link
            key={client.id}
            href={`/provider/clients/detail?id=${client.id}`}
            className="bg-surface-elevated rounded-xl border border-hairline p-5 hover:border-section-primary/50 transition-colors group"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                {client.photoUrl ? (
                  <Image
                    src={client.photoUrl}
                    alt={client.name}
                    width={56}
                    height={56}
                    unoptimized
                    className="w-14 h-14 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-section-gradient flex items-center justify-center">
                    <span className="text-xl font-semibold text-white">
                      {client.name.charAt(0)}
                    </span>
                  </div>
                )}
                <div>
                  <h3 className="font-semibold text-content group-hover:text-section-primary transition-colors">
                    {client.name}
                  </h3>
                  <p className="text-sm text-gray-400">{client.email}</p>
                  {client.notes && (
                    <div className="flex items-center gap-1 mt-1">
                      <FileText className="w-3 h-3 text-gray-500" />
                      <span className="text-xs text-gray-500">{t('provider.clients.hasNotes')}</span>
                    </div>
                  )}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-section-primary transition-colors" />
            </div>

            <div className="grid grid-cols-3 gap-4 mt-5 pt-4 border-t border-hairline">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
                  <Calendar className="w-4 h-4" />
                </div>
                <p className="text-lg font-semibold text-content">{client.totalBookings}</p>
                <p className="text-xs text-gray-500">{t('provider.clients.stat.bookings')}</p>
              </div>
              <div className="text-center border-x border-hairline">
                <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
                  <DollarSign className="w-4 h-4" />
                </div>
                <p className="text-lg font-semibold text-content">€{client.totalSpent}</p>
                <p className="text-xs text-gray-500">{t('provider.clients.stat.totalSpent')}</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
                  <Users className="w-4 h-4" />
                </div>
                <p className="text-lg font-semibold text-content">
                  {formatDate(client.lastVisit)}
                </p>
                <p className="text-xs text-gray-500">{t('provider.clients.stat.lastVisit')}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {filteredClients.length === 0 && (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-content mb-2">{t('provider.clients.empty.title')}</h3>
          <p className="text-gray-400">{t('provider.clients.empty.subtitle')}</p>
        </div>
      )}
    </div>
  );
}

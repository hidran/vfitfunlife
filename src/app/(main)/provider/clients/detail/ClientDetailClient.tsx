'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Mail, Phone, Calendar, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import { useProviderStore } from '@/stores/providerStore';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';
import OverviewTab from './tabs/OverviewTab';
import MeetingsTab from './tabs/MeetingsTab';
import NotesTab from './tabs/NotesTab';
import GoalsTab from './tabs/GoalsTab';
import TrainingTab from './tabs/TrainingTab';
import DietTab from './tabs/DietTab';
import RecipesTab from './tabs/RecipesTab';

type TabId = 'overview' | 'meetings' | 'goals' | 'training' | 'diet' | 'recipes' | 'notes';

const TABS: TabId[] = ['overview', 'meetings', 'goals', 'training', 'diet', 'recipes', 'notes'];

export default function ClientDetailClient() {
  const { t, locale } = useI18n();
  const searchParams = useSearchParams();
  const clientId = searchParams?.get('id') ?? undefined;

  const {
    currentClient: client,
    clientBookingHistory: bookingHistory,
    clientNotes,
    isLoading,
    fetchClientDetails,
  } = useProviderStore();

  const [activeTab, setActiveTab] = useState<TabId>('overview');

  useEffect(() => {
    if (clientId) {
      void fetchClientDetails(clientId);
    }
  }, [clientId, fetchClientDetails]);

  if (!clientId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-text-secondary">{t('provider.clientDetail.notSpecified')}</p>
      </div>
    );
  }

  if (isLoading || !client) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="md" />
      </div>
    );
  }

  const formatDate = (date: Date | { toDate(): Date } | undefined) => {
    if (!date) return t('provider.clientDetail.dateNever');
    const d = typeof date === 'object' && 'toDate' in date ? date.toDate() : date;
    return new Date(d).toLocaleDateString(toLocaleTag(locale), {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <Link
        href="/provider/clients"
        className="inline-flex items-center gap-2 text-gray-400 hover:text-content transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('provider.clientDetail.backToClients')}
      </Link>

      {/* Profile Header */}
      <div className="bg-surface-elevated rounded-xl border border-hairline p-6">
        <div className="flex flex-col sm:flex-row items-start gap-6">
          {client.photoUrl ? (
            <Image
              src={client.photoUrl}
              alt={client.name}
              width={96}
              height={96}
              unoptimized
              className="w-24 h-24 rounded-full object-cover"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-section-gradient flex items-center justify-center">
              <span className="text-3xl font-bold text-white">
                {client.name.charAt(0)}
              </span>
            </div>
          )}

          <div className="flex-1">
            <h1 className="text-2xl font-bold text-content">{client.name}</h1>
            <div className="flex flex-col sm:flex-row gap-4 mt-3">
              <a href={`mailto:${client.email}`} className="flex items-center gap-2 text-gray-400 hover:text-content text-sm">
                <Mail className="w-4 h-4" />
                {client.email}
              </a>
              {client.phone && (
                <a href={`tel:${client.phone}`} className="flex items-center gap-2 text-gray-400 hover:text-content text-sm">
                  <Phone className="w-4 h-4" />
                  {client.phone}
                </a>
              )}
            </div>

            {client.tags && (
              <div className="flex flex-wrap gap-2 mt-4">
                {client.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 bg-section-primary/20 text-section-primary rounded-full text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="secondary">
              <MessageSquare className="w-4 h-4 mr-2" />
              {t('provider.clientDetail.message')}
            </Button>
            <Button>
              <Calendar className="w-4 h-4 mr-2" />
              {t('provider.clientDetail.bookSession')}
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-hairline">
          <div>
            <p className="text-2xl font-bold text-content">{client.totalBookings}</p>
            <p className="text-sm text-gray-400">{t('provider.clientDetail.totalBookings')}</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-content">€{client.totalSpent}</p>
            <p className="text-sm text-gray-400">{t('provider.clientDetail.totalSpent')}</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-content">{formatDate(client.firstVisit)}</p>
            <p className="text-sm text-gray-400">{t('provider.clientDetail.firstVisit')}</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-content">{formatDate(client.lastVisit)}</p>
            <p className="text-sm text-gray-400">{t('provider.clientDetail.lastVisit')}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-hairline overflow-x-auto scrollbar-none">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap shrink-0',
              activeTab === tab
                ? 'text-content border-section-primary'
                : 'text-gray-400 border-transparent hover:text-content'
            )}
          >
            {t(`clientDetail.tab.${tab}`)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === 'overview' && <OverviewTab client={client} bookingHistory={bookingHistory} />}
        {activeTab === 'meetings' && <MeetingsTab bookingHistory={bookingHistory} />}
        {activeTab === 'goals' && <GoalsTab clientId={clientId} />}
        {activeTab === 'training' && <TrainingTab clientId={clientId} />}
        {activeTab === 'diet' && <DietTab clientId={clientId} />}
        {activeTab === 'recipes' && <RecipesTab clientId={clientId} />}
        {activeTab === 'notes' && <NotesTab clientId={clientId} initialNotes={clientNotes} />}
      </div>
    </div>
  );
}

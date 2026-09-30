'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Mail, Phone, Calendar, MessageSquare, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';
import { useProviderStore } from '@/stores/providerStore';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';
import { chatHref } from '@/lib/routes';
import { resendClientAccountEmail } from '@/lib/firebase/functions';
import { callableErrorMessage } from '@/components/provider/schedule/ScheduleSheet';
import OverviewTab from './tabs/OverviewTab';
import MeetingsTab from './tabs/MeetingsTab';
import NotesTab from './tabs/NotesTab';
import GoalsTab from './tabs/GoalsTab';
import TrainingTab from './tabs/TrainingTab';
import RecipesTab from './tabs/RecipesTab';

// No 'diet' tab: diet plans were removed in P2-6. Only medici, biologi nutrizionisti and
// dietisti may prescribe one, so the platform does not offer the tool.
type TabId = 'overview' | 'meetings' | 'goals' | 'training' | 'recipes' | 'notes';

const TABS: TabId[] = ['overview', 'meetings', 'goals', 'training', 'recipes', 'notes'];

export default function ClientDetailClient() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientId = searchParams?.get('id') ?? undefined;

  const {
    currentClient: client,
    clientBookingHistory: bookingHistory,
    clientNotes,
    isLoading,
    fetchClientDetails,
  } = useProviderStore(
    useShallow((s) => ({
      currentClient: s.currentClient,
      clientBookingHistory: s.clientBookingHistory,
      clientNotes: s.clientNotes,
      isLoading: s.isLoading,
      fetchClientDetails: s.fetchClientDetails,
    })),
  );

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // An account the trainer created that the client has not confirmed yet (roster badge).
  const handleResend = async (userId: string) => {
    if (resending) return;
    setResending(true);
    setResendNotice(null);
    try {
      const { status } = await resendClientAccountEmail(userId);
      if (status === 'already_active') {
        setResendNotice({ ok: true, text: t('provider.clients.resend.alreadyActive') });
        if (clientId) void fetchClientDetails(clientId);
      } else {
        setResendNotice({ ok: true, text: t('provider.clients.resend.sent') });
      }
    } catch (err) {
      const message = callableErrorMessage(err);
      setResendNotice({
        ok: false,
        text: message.includes('rate_limited')
          ? t('provider.addClient.error.rateLimited')
          : t('provider.clients.resend.failed'),
      });
    } finally {
      setResending(false);
    }
  };

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
        className="inline-flex items-center gap-2 text-content-muted hover:text-content transition-colors"
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
            {client.accountStatus === 'invited' && (
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="inline-flex px-2 py-0.5 rounded-full bg-warning/15 text-warning text-xs font-medium">
                  {t('provider.clients.pendingConfirmation')}
                </span>
                {client.userId && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    isLoading={resending}
                    disabled={resending}
                    onClick={() => handleResend(client.userId)}
                  >
                    <Send className="w-4 h-4 mr-1" aria-hidden="true" />
                    {t('provider.clients.resendEmail')}
                  </Button>
                )}
              </div>
            )}
            {resendNotice && (
              <p
                className={cn('text-sm mt-2', resendNotice.ok ? 'text-content-muted' : 'text-error')}
                role={resendNotice.ok ? 'status' : 'alert'}
              >
                {resendNotice.text}
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-4 mt-3">
              <a href={`mailto:${client.email}`} className="flex min-w-0 items-center gap-2 text-content-muted hover:text-content text-sm">
                <Mail className="w-4 h-4 shrink-0" />
                <span className="truncate">{client.email}</span>
              </a>
              {client.phone && (
                <a href={`tel:${client.phone}`} className="flex items-center gap-2 text-content-muted hover:text-content text-sm">
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
                    className="px-3 py-1 bg-section-primary/20 text-section-primary light:text-primary-dark rounded-full text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {/* clients/{id} is the roster entry; the chat is with the client's user account. */}
            {client.userId && (
              <Button
                variant="secondary"
                onClick={() =>
                  router.push(
                    chatHref(client.userId, { name: client.name, photoUrl: client.photoUrl ?? null }),
                  )
                }
              >
                <MessageSquare className="w-4 h-4 mr-2" aria-hidden="true" />
                {t('provider.clientDetail.message')}
              </Button>
            )}
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
            <p className="text-sm text-content-muted">{t('provider.clientDetail.totalBookings')}</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-content">€{client.totalSpent}</p>
            <p className="text-sm text-content-muted">{t('provider.clientDetail.totalSpent')}</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-content">{formatDate(client.firstVisit)}</p>
            <p className="text-sm text-content-muted">{t('provider.clientDetail.firstVisit')}</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-content">{formatDate(client.lastVisit)}</p>
            <p className="text-sm text-content-muted">{t('provider.clientDetail.lastVisit')}</p>
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
                : 'text-content-muted border-transparent hover:text-content'
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
        {activeTab === 'recipes' && <RecipesTab clientId={clientId} />}
        {activeTab === 'notes' && <NotesTab clientId={clientId} initialNotes={clientNotes} />}
      </div>
    </div>
  );
}

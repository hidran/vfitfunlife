'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Calendar, Clock, Glasses, MapPin, PartyPopper, Sparkles, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FUN_ROUTE_CONTENT, type FunRouteSlug } from '@/lib/featureRouteContent';
import { useI18n } from '@/hooks/useI18n';
import { useFunActivities } from '@/hooks/useFunActivities';
import type { MessageKey } from '@/i18n/messages';
import { toLocaleTag } from '@/types/locale';

type EventTag = 'hot' | 'vip' | 'new';
type EventFilter = 'all' | EventTag;

const eventTagKeys: Record<EventTag, MessageKey> = {
  hot: 'funRoute.events.tag.hot',
  vip: 'funRoute.events.tag.vip',
  new: 'funRoute.events.tag.new',
};

const eventFilters: Array<{ id: EventFilter; labelKey: MessageKey }> = [
  { id: 'all', labelKey: 'funRoute.events.filter.all' },
  { id: 'hot', labelKey: 'funRoute.events.filter.hot' },
  { id: 'vip', labelKey: 'funRoute.events.filter.vip' },
  { id: 'new', labelKey: 'funRoute.events.filter.new' },
];

export function FunRouteScreen({ slug }: { slug: FunRouteSlug }) {
  const { t, locale } = useI18n();
  const content = FUN_ROUTE_CONTENT[slug];
  const Icon = content?.icon ?? Sparkles;
  const isPartyRoute = slug === 'parties' || slug === 'party-mode';
  const isEventSlug = slug === 'events';
  const isVrSlug = slug === 'vr';
  const isTvSlug = slug === 'tv';
  const [eventQuery, setEventQuery] = useState('');
  const [eventFilter, setEventFilter] = useState<EventFilter>('all');

  const eventsQuery = useFunActivities('event', { enabled: isEventSlug });
  const vrQuery = useFunActivities('vr', { enabled: isVrSlug });
  const partyQuery = useFunActivities('party', { enabled: isPartyRoute });

  const numberFormatter = useMemo(() => new Intl.NumberFormat(toLocaleTag(locale)), [locale]);
  const filteredEvents = useMemo(() => {
    const normalizedQuery = eventQuery.trim().toLocaleLowerCase();
    return (eventsQuery.data ?? []).filter((event) => {
      const matchesFilter = eventFilter === 'all' || event.tag === eventFilter;
      const matchesQuery = !normalizedQuery || event.fullName.toLocaleLowerCase().includes(normalizedQuery) ||
        (event.location ?? '').toLocaleLowerCase().includes(normalizedQuery);
      return matchesFilter && matchesQuery;
    });
  }, [eventsQuery.data, eventFilter, eventQuery]);

  return (
    <div className="container-mobile space-y-6 py-6 pb-24">
      <section className="relative overflow-hidden rounded-3xl border border-hairline bg-content/5 p-5">
        <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-section-primary/20 blur-2xl" />
        <div className="absolute -bottom-12 left-0 h-32 w-32 rounded-full bg-section-secondary/20 blur-3xl" />
        <div className="relative">
          <span className="inline-flex items-center rounded-full border border-content/15 bg-content/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">{t('funRoute.badge')}</span>
          <div className="mt-4 flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-section-primary/20 text-section-primary"><Icon className="h-6 w-6" /></div>
            <div><h1 className="text-2xl font-display font-bold text-text-inverse">{t(content.titleKey)}</h1><p className="mt-1 text-sm text-text-secondary">{t(content.descriptionKey)}</p></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/home" className="min-h-11 rounded-full border border-content/15 bg-content/10 px-4 py-3 text-xs font-semibold text-text-inverse">{t('common.backToHome')}</Link>
            <Link href="/bookings" className="min-h-11 rounded-full bg-section-primary px-4 py-3 text-xs font-semibold text-background-dark light:text-content">{t('funRoute.actions.myBookings')}</Link>
          </div>
        </div>
      </section>

      {isEventSlug && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-hairline bg-content/5 p-4">
            <Input value={eventQuery} onChange={(event) => setEventQuery(event.target.value)} placeholder={t('funRoute.events.searchPlaceholder')} />
            <div className="mt-3 flex flex-wrap gap-2">
              {eventFilters.map((filter) => <button key={filter.id} type="button" onClick={() => setEventFilter(filter.id)} className={cn('min-h-11 rounded-full border px-3 py-2 text-xs font-semibold transition-colors', eventFilter === filter.id ? 'border-section-primary bg-section-primary text-background-dark light:text-content' : 'border-content/15 bg-content/5 text-text-tertiary')}>{t(filter.labelKey)}</button>)}
            </div>
          </div>
          <div className="space-y-3">
            {eventsQuery.isLoading && <p className="rounded-2xl border border-hairline bg-content/5 p-4 text-sm text-text-tertiary">{t('common.loading')}</p>}
            {filteredEvents.map((event) => (
              <article key={event.id} className="rounded-2xl border border-hairline bg-content/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><h2 className="text-sm font-semibold text-text-inverse">{event.fullName}</h2>{(event.eventDate || event.eventTime) && <p className="mt-1 flex items-center gap-2 text-xs text-text-tertiary">{event.eventDate && <><Calendar className="h-3.5 w-3.5" />{event.eventDate}</>}{event.eventTime && <><Clock className="ml-1 h-3.5 w-3.5" />{event.eventTime}</>}</p>}{event.location && <p className="mt-1 flex items-center gap-2 text-xs text-text-tertiary"><MapPin className="h-3.5 w-3.5" />{event.location}</p>}</div>
                  {event.tag && <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase', event.tag === 'vip' && 'bg-vip-gold/90 text-background-dark light:text-content', event.tag === 'hot' && 'bg-orange-500/90 text-white', event.tag === 'new' && 'bg-section-primary/90 text-background-dark light:text-content')}>{t(eventTagKeys[event.tag])}</span>}
                </div>
                {(event.attendees !== undefined || event.lowestPrice !== undefined) && <div className="mt-3 flex items-center justify-between">
                  {event.attendees !== undefined && <span className="flex items-center gap-1 text-xs text-text-tertiary"><Users className="h-3.5 w-3.5" />{t('funRoute.events.attendeesExpected', { count: numberFormatter.format(event.attendees) })}</span>}
                  {event.lowestPrice !== undefined && <span className="text-sm font-bold text-section-primary">{t('funRoute.price.fromEur', { price: event.lowestPrice })}</span>}
                </div>}
                <Link href={`/book?providerId=${encodeURIComponent(event.id)}`} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-section-primary/20 px-4 py-2 text-sm font-semibold text-section-primary">{t('funRoute.events.bookTicket')}</Link>
              </article>
            ))}
            {!eventsQuery.isLoading && filteredEvents.length === 0 && <p className="rounded-2xl border border-hairline bg-content/5 p-4 text-sm text-text-tertiary">{t('funRoute.events.empty')}</p>}
          </div>
        </section>
      )}

      {isVrSlug && (
        <section className="grid gap-3 sm:grid-cols-2">
          {vrQuery.isLoading && <p className="col-span-2 rounded-2xl border border-hairline bg-content/5 p-4 text-sm text-text-tertiary">{t('common.loading')}</p>}
          {!vrQuery.isLoading && (vrQuery.data ?? []).length === 0 && <p className="col-span-2 rounded-2xl border border-hairline bg-content/5 p-4 text-sm text-text-tertiary">{t('funRoute.vr.empty')}</p>}
          {(vrQuery.data ?? []).map((experience) => (
            <article key={experience.id} className="rounded-2xl border border-hairline bg-content/5 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20"><Glasses className="h-5 w-5 text-indigo-300 light:text-indigo-700" /></div>
              <h2 className="mt-3 text-sm font-semibold text-text-inverse">{experience.fullName}</h2>
              {experience.durationMinutes !== undefined && <p className="mt-1 text-xs text-text-tertiary">{t('funRoute.vr.durationMinutes', { count: experience.durationMinutes })}</p>}
              <div className="mt-3 flex items-center justify-between">
                {experience.lowestPrice !== undefined && <span className="text-sm font-bold text-text-inverse">{t('funRoute.price.eur', { price: experience.lowestPrice })}</span>}
                <Link href={`/book?providerId=${encodeURIComponent(experience.id)}`} className="min-h-11 rounded-full bg-indigo-500/20 px-3 py-2 text-xs font-semibold text-indigo-300 light:text-indigo-700">{t('funRoute.vr.book')}</Link>
              </div>
            </article>
          ))}
        </section>
      )}

      {isPartyRoute && (
        <section className="grid gap-3 sm:grid-cols-3">
          {partyQuery.isLoading && <p className="col-span-3 rounded-2xl border border-hairline bg-content/5 p-4 text-sm text-text-tertiary">{t('common.loading')}</p>}
          {!partyQuery.isLoading && (partyQuery.data ?? []).length === 0 && <p className="col-span-3 rounded-2xl border border-hairline bg-content/5 p-4 text-sm text-text-tertiary">{t('funRoute.party.empty')}</p>}
          {(partyQuery.data ?? []).map((partyPackage) => (
            <article key={partyPackage.id} className="rounded-2xl border border-hairline bg-content/5 p-4">
              <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-text-inverse">{partyPackage.fullName}</h2><PartyPopper className="h-4 w-4 text-section-primary" /></div>
              {partyPackage.lowestPrice !== undefined && <p className="mt-2 text-sm font-bold text-section-primary">{t('funRoute.price.fromEur', { price: partyPackage.lowestPrice })}</p>}
              <Link href={`/book?providerId=${encodeURIComponent(partyPackage.id)}`} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-section-primary/20 px-4 py-2 text-sm font-semibold text-section-primary">{t('funRoute.party.package.book')}</Link>
            </article>
          ))}
        </section>
      )}

      {isTvSlug && (
        <section className="space-y-4">
          <p className="rounded-2xl border border-hairline bg-content/5 p-4 text-sm text-text-secondary">{t('funRoute.tv.empty' as MessageKey)}</p>
        </section>
      )}
    </div>
  );
}

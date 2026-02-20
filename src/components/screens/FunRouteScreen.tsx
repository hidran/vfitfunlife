'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Calendar,
  Clock,
  Glasses,
  MapPin,
  PartyPopper,
  Play,
  Radio,
  Sparkles,
  Star,
  Ticket,
  Tv,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FUN_ROUTE_CONTENT, type FunRouteSlug } from '@/lib/featureRouteContent';
import { useI18n } from '@/hooks/useI18n';
import type { MessageKey } from '@/i18n/messages';
import { toLocaleTag } from '@/types/locale';

type EventTag = 'hot' | 'vip' | 'new';
type EventFilter = 'all' | EventTag;
type PartyEventType = 'private' | 'corporate' | 'birthday' | 'bachelor';

interface FunEvent {
  id: string;
  titleKey: MessageKey;
  date: string;
  time: string;
  locationKey: MessageKey;
  priceFrom: number;
  attendees: number;
  tag: EventTag;
}

interface VrExperience {
  id: string;
  titleKey: MessageKey;
  durationMinutes: number;
  levelKey: MessageKey;
  rating: number;
  price: number;
}

interface TvShow {
  id: string;
  time: string;
  titleKey: MessageKey;
  channelKey: MessageKey;
  isLive: boolean;
}

interface PartyPackage {
  id: string;
  nameKey: MessageKey;
  priceFrom: number;
  capacityKey: MessageKey;
  featureKeys: MessageKey[];
}

const eventTagKeys: Record<EventTag, MessageKey> = {
  hot: 'funRoute.events.tag.hot',
  vip: 'funRoute.events.tag.vip',
  new: 'funRoute.events.tag.new',
};

const upcomingEvents: FunEvent[] = [
  {
    id: 'sunset-sessions',
    titleKey: 'funRoute.events.item.sunset.title',
    date: '16 Feb',
    time: '18:30',
    locationKey: 'funRoute.events.item.sunset.location',
    priceFrom: 39,
    attendees: 420,
    tag: 'hot',
  },
  {
    id: 'fit-party',
    titleKey: 'funRoute.events.item.fitParty.title',
    date: '20 Feb',
    time: '21:00',
    locationKey: 'funRoute.events.item.fitParty.location',
    priceFrom: 28,
    attendees: 680,
    tag: 'new',
  },
  {
    id: 'vip-gala',
    titleKey: 'funRoute.events.item.vipGala.title',
    date: '27 Feb',
    time: '20:30',
    locationKey: 'funRoute.events.item.vipGala.location',
    priceFrom: 90,
    attendees: 180,
    tag: 'vip',
  },
  {
    id: 'neon-run',
    titleKey: 'funRoute.events.item.neonRun.title',
    date: '3 Mar',
    time: '22:00',
    locationKey: 'funRoute.events.item.neonRun.location',
    priceFrom: 32,
    attendees: 510,
    tag: 'hot',
  },
];

const vrExperiences: VrExperience[] = [
  {
    id: 'vr-boxing',
    titleKey: 'funRoute.vr.item.boxing.title',
    durationMinutes: 45,
    levelKey: 'funRoute.vr.level.advanced',
    rating: 4.8,
    price: 22,
  },
  {
    id: 'vr-dance',
    titleKey: 'funRoute.vr.item.dance.title',
    durationMinutes: 30,
    levelKey: 'funRoute.vr.level.all',
    rating: 4.7,
    price: 16,
  },
  {
    id: 'vr-racing',
    titleKey: 'funRoute.vr.item.racing.title',
    durationMinutes: 35,
    levelKey: 'funRoute.vr.level.intermediate',
    rating: 4.9,
    price: 20,
  },
  {
    id: 'vr-escape',
    titleKey: 'funRoute.vr.item.escape.title',
    durationMinutes: 60,
    levelKey: 'funRoute.vr.level.team',
    rating: 4.9,
    price: 26,
  },
];

const tvSchedule: TvShow[] = [
  {
    id: 'tv-1',
    time: '10:00',
    titleKey: 'funRoute.tv.show.1.title',
    channelKey: 'funRoute.tv.channel.wellness',
    isLive: false,
  },
  {
    id: 'tv-2',
    time: '14:30',
    titleKey: 'funRoute.tv.show.2.title',
    channelKey: 'funRoute.tv.channel.fit',
    isLive: true,
  },
  {
    id: 'tv-3',
    time: '18:00',
    titleKey: 'funRoute.tv.show.3.title',
    channelKey: 'funRoute.tv.channel.life',
    isLive: false,
  },
  {
    id: 'tv-4',
    time: '21:00',
    titleKey: 'funRoute.tv.show.4.title',
    channelKey: 'funRoute.tv.channel.fun',
    isLive: false,
  },
  {
    id: 'tv-5',
    time: '23:30',
    titleKey: 'funRoute.tv.show.5.title',
    channelKey: 'funRoute.tv.channel.fun',
    isLive: true,
  },
];

const partyPackages: PartyPackage[] = [
  {
    id: 'private',
    nameKey: 'funRoute.party.package.private.name',
    priceFrom: 790,
    capacityKey: 'funRoute.party.package.private.capacity',
    featureKeys: [
      'funRoute.party.package.private.feature1',
      'funRoute.party.package.private.feature2',
      'funRoute.party.package.private.feature3',
    ],
  },
  {
    id: 'corporate',
    nameKey: 'funRoute.party.package.corporate.name',
    priceFrom: 1490,
    capacityKey: 'funRoute.party.package.corporate.capacity',
    featureKeys: [
      'funRoute.party.package.corporate.feature1',
      'funRoute.party.package.corporate.feature2',
      'funRoute.party.package.corporate.feature3',
    ],
  },
  {
    id: 'vip',
    nameKey: 'funRoute.party.package.vip.name',
    priceFrom: 2600,
    capacityKey: 'funRoute.party.package.vip.capacity',
    featureKeys: [
      'funRoute.party.package.vip.feature1',
      'funRoute.party.package.vip.feature2',
      'funRoute.party.package.vip.feature3',
    ],
  },
];

const eventFilters: Array<{ id: EventFilter; labelKey: MessageKey }> = [
  { id: 'all', labelKey: 'funRoute.events.filter.all' },
  { id: 'hot', labelKey: 'funRoute.events.filter.hot' },
  { id: 'vip', labelKey: 'funRoute.events.filter.vip' },
  { id: 'new', labelKey: 'funRoute.events.filter.new' },
];

const partyEventTypeOptions: Array<{ id: PartyEventType; labelKey: MessageKey }> = [
  { id: 'private', labelKey: 'funRoute.party.eventType.private' },
  { id: 'corporate', labelKey: 'funRoute.party.eventType.corporate' },
  { id: 'birthday', labelKey: 'funRoute.party.eventType.birthday' },
  { id: 'bachelor', labelKey: 'funRoute.party.eventType.bachelor' },
];

export function FunRouteScreen({ slug }: { slug: FunRouteSlug }) {
  const { t, locale } = useI18n();
  const content = FUN_ROUTE_CONTENT[slug];
  const Icon = content?.icon ?? Sparkles;
  const isPartyRoute = slug === 'parties' || slug === 'party-mode';
  const [eventQuery, setEventQuery] = useState('');
  const [eventFilter, setEventFilter] = useState<EventFilter>('all');
  const [selectedChannel, setSelectedChannel] = useState<MessageKey | 'all'>('all');
  const [quoteSent, setQuoteSent] = useState(false);
  const [partyForm, setPartyForm] = useState({
    eventType: 'private' as PartyEventType,
    attendees: '60',
    date: '',
    budget: '',
  });

  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(toLocaleTag(locale)),
    [locale]
  );

  const filteredEvents = useMemo(() => {
    const normalizedQuery = eventQuery.trim().toLowerCase();
    return upcomingEvents.filter((event) => {
      const matchesFilter = eventFilter === 'all' || event.tag === eventFilter;
      const matchesQuery =
        !normalizedQuery ||
        t(event.titleKey).toLowerCase().includes(normalizedQuery) ||
        t(event.locationKey).toLowerCase().includes(normalizedQuery);
      return matchesFilter && matchesQuery;
    });
  }, [eventFilter, eventQuery, t]);

  const channels = useMemo(
    () => ['all' as const, ...Array.from(new Set(tvSchedule.map((show) => show.channelKey)))],
    []
  );

  const filteredShows = useMemo(() => {
    if (selectedChannel === 'all') return tvSchedule;
    return tvSchedule.filter((show) => show.channelKey === selectedChannel);
  }, [selectedChannel]);

  return (
    <div className="container-mobile py-6 pb-24 space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-section-primary/20 blur-2xl" />
        <div className="absolute -bottom-12 left-0 h-32 w-32 rounded-full bg-section-secondary/20 blur-3xl" />
        <div className="relative">
          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
            {t('funRoute.badge')}
          </span>
          <div className="mt-4 flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-section-primary/20 text-section-primary">
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold text-text-inverse">
                {t(content.titleKey)}
              </h1>
              <p className="mt-1 text-sm text-text-secondary">{t(content.descriptionKey)}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/home"
              className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-text-inverse"
            >
              {t('common.backToHome')}
            </Link>
            <Link
              href="/bookings"
              className="rounded-full bg-section-primary px-4 py-2 text-xs font-semibold text-background-dark"
            >
              {t('funRoute.actions.myBookings')}
            </Link>
          </div>
        </div>
      </section>

      {slug === 'events' && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-black/20 p-3">
                <p className="text-xs text-text-tertiary">{t('funRoute.events.stats.month')}</p>
                <p className="mt-1 text-xl font-bold text-text-inverse">24</p>
              </div>
              <div className="rounded-xl bg-black/20 p-3">
                <p className="text-xs text-text-tertiary">{t('funRoute.events.stats.vip')}</p>
                <p className="mt-1 text-xl font-bold text-text-inverse">8</p>
              </div>
              <div className="rounded-xl bg-black/20 p-3">
                <p className="text-xs text-text-tertiary">{t('funRoute.events.stats.spots')}</p>
                <p className="mt-1 text-xl font-bold text-text-inverse">1.790</p>
              </div>
            </div>
            <div className="mt-4">
              <Input
                value={eventQuery}
                onChange={(event) => setEventQuery(event.target.value)}
                placeholder={t('funRoute.events.searchPlaceholder')}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {eventFilters.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setEventFilter(filter.id)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                    eventFilter === filter.id
                      ? 'border-section-primary bg-section-primary text-background-dark'
                      : 'border-white/15 bg-white/5 text-text-tertiary'
                  )}
                >
                  {t(filter.labelKey)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {filteredEvents.map((event) => (
              <article key={event.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-text-inverse">{t(event.titleKey)}</h2>
                    <p className="mt-1 flex items-center gap-2 text-xs text-text-tertiary">
                      <Calendar className="h-3.5 w-3.5" />
                      {event.date}
                      <Clock className="ml-1 h-3.5 w-3.5" />
                      {event.time}
                    </p>
                    <p className="mt-1 flex items-center gap-2 text-xs text-text-tertiary">
                      <MapPin className="h-3.5 w-3.5" />
                      {t(event.locationKey)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase',
                      event.tag === 'vip' && 'bg-vip-gold/90 text-background-dark',
                      event.tag === 'hot' && 'bg-orange-500/90 text-white',
                      event.tag === 'new' && 'bg-section-primary/90 text-background-dark'
                    )}
                  >
                    {t(eventTagKeys[event.tag])}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-xs text-text-tertiary">
                    <Users className="h-3.5 w-3.5" />
                    {t('funRoute.events.attendeesExpected', {
                      count: numberFormatter.format(event.attendees),
                    })}
                  </span>
                  <span className="text-sm font-bold text-section-primary">
                    {t('funRoute.price.fromEur', { price: event.priceFrom })}
                  </span>
                </div>
                <Link
                  href="/booking"
                  className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-section-primary/20 px-4 py-2 text-sm font-semibold text-section-primary"
                >
                  {t('funRoute.events.bookTicket')}
                </Link>
              </article>
            ))}
            {filteredEvents.length === 0 && (
              <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-text-tertiary">
                {t('funRoute.events.empty')}
              </p>
            )}
          </div>
        </section>
      )}

      {slug === 'vr' && (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {vrExperiences.map((experience) => (
              <article key={experience.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20">
                    <Glasses className="h-5 w-5 text-indigo-300" />
                  </div>
                  <div className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    <span className="text-[11px] font-semibold text-text-inverse">
                      {experience.rating}
                    </span>
                  </div>
                </div>
                <h2 className="mt-3 text-sm font-semibold text-text-inverse">{t(experience.titleKey)}</h2>
                <p className="mt-1 text-xs text-text-tertiary">
                  {t('funRoute.vr.durationMinutes', { count: experience.durationMinutes })} ·{' '}
                  {t(experience.levelKey)}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm font-bold text-text-inverse">
                    {t('funRoute.price.eur', { price: experience.price })}
                  </span>
                  <Link
                    href="/booking"
                    className="rounded-full bg-indigo-500/20 px-3 py-1.5 text-xs font-semibold text-indigo-300"
                  >
                    {t('funRoute.vr.book')}
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-text-secondary">
            {t('funRoute.vr.note')}
          </div>
        </section>
      )}

      {isPartyRoute && (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {partyPackages.map((partyPackage) => (
              <article key={partyPackage.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-text-inverse">{t(partyPackage.nameKey)}</h2>
                  <PartyPopper className="h-4 w-4 text-section-primary" />
                </div>
                <p className="mt-2 text-xs text-text-tertiary">{t(partyPackage.capacityKey)}</p>
                <p className="mt-2 text-sm font-bold text-section-primary">
                  {t('funRoute.price.fromEur', { price: partyPackage.priceFrom })}
                </p>
                <ul className="mt-3 space-y-1">
                  {partyPackage.featureKeys.map((featureKey) => (
                    <li key={featureKey} className="text-xs text-text-tertiary">
                      • {t(featureKey)}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              setQuoteSent(true);
            }}
            className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4"
          >
            <h3 className="text-base font-semibold text-text-inverse">{t('funRoute.party.quote.title')}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-text-tertiary">
                  {t('funRoute.party.quote.eventType')}
                </label>
                <select
                  value={partyForm.eventType}
                  onChange={(event) =>
                    setPartyForm((current) => ({
                      ...current,
                      eventType: event.target.value as PartyEventType,
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#2A2D3A] px-3 py-3 text-sm text-text-inverse focus:outline-none focus:ring-2 focus:ring-section-primary"
                >
                  {partyEventTypeOptions.map((eventType) => (
                    <option key={eventType.id} value={eventType.id}>
                      {t(eventType.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                type="number"
                label={t('funRoute.party.quote.guestsLabel')}
                min={10}
                value={partyForm.attendees}
                onChange={(event) =>
                  setPartyForm((current) => ({ ...current, attendees: event.target.value }))
                }
              />
              <Input
                type="date"
                label={t('funRoute.party.quote.dateLabel')}
                value={partyForm.date}
                onChange={(event) =>
                  setPartyForm((current) => ({ ...current, date: event.target.value }))
                }
              />
              <Input
                label={t('funRoute.party.quote.budgetLabel')}
                placeholder={t('funRoute.party.quote.budgetPlaceholder')}
                value={partyForm.budget}
                onChange={(event) =>
                  setPartyForm((current) => ({ ...current, budget: event.target.value }))
                }
              />
            </div>
            <Button type="submit" fullWidth>
              {t('funRoute.party.quote.submit')}
            </Button>
            {quoteSent && (
              <p className="text-sm text-success-DEFAULT">{t('funRoute.party.quote.success')}</p>
            )}
          </form>
        </section>
      )}

      {slug === 'tv' && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
            <div className="flex items-center gap-3">
              <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-red-500/25">
                <Radio className="h-5 w-5 text-red-400" />
                <span className="absolute -right-0.5 -top-0.5 inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-red-400">
                  {t('funRoute.tv.liveNow')}
                </p>
                <h2 className="text-sm font-semibold text-text-inverse">
                  {t('funRoute.tv.liveTitle')}
                </h2>
              </div>
              <button
                type="button"
                className="ml-auto rounded-full bg-red-500/20 p-2 text-red-400"
                aria-label={t('funRoute.tv.livePlayAria')}
              >
                <Play className="h-4 w-4 fill-current" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {channels.map((channel) => (
              <button
                key={channel}
                type="button"
                onClick={() => setSelectedChannel(channel)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                  selectedChannel === channel
                    ? 'border-section-primary bg-section-primary text-background-dark'
                    : 'border-white/15 bg-white/5 text-text-tertiary'
                )}
              >
                {channel === 'all' ? t('funRoute.tv.channels.all') : t(channel)}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {filteredShows.map((show) => (
              <article
                key={show.id}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border p-3',
                  show.isLive ? 'border-red-500/30 bg-red-500/10' : 'border-white/10 bg-white/5'
                )}
              >
                <div
                  className={cn(
                    'flex h-11 w-11 flex-col items-center justify-center rounded-xl text-xs font-semibold',
                    show.isLive ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-text-tertiary'
                  )}
                >
                  {show.time}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text-inverse">{t(show.titleKey)}</p>
                  <p className="text-xs text-text-tertiary">{t(show.channelKey)}</p>
                </div>
                <span
                  className={cn(
                    'rounded-full px-2 py-1 text-[10px] font-semibold uppercase',
                    show.isLive ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-text-tertiary'
                  )}
                >
                  {show.isLive ? t('funRoute.tv.status.live') : t('funRoute.tv.status.replay')}
                </span>
              </article>
            ))}
          </div>

          <Link
            href="/booking"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-section-primary/20 px-4 py-3 text-sm font-semibold text-section-primary"
          >
            <Ticket className="h-4 w-4" />
            {t('funRoute.tv.linkedEvents')}
          </Link>
        </section>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-text-tertiary">
        <p className="flex items-center gap-2">
          <Tv className="h-4 w-4" />
          {t('funRoute.footer.realtime')}
        </p>
      </div>
    </div>
  );
}

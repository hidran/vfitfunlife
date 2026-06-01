'use client';

import Link from 'next/link';
import { useSection } from '@/contexts/SectionContext';
import {
  ArrowUpRight,
  Briefcase,
  Calendar,
  ChevronRight,
  Clock,
  Dumbbell,
  Gamepad2,
  Glasses,
  Home as HomeIcon,
  MapPin,
  PartyPopper,
  Play,
  Radio,
  Sparkles,
  Star,
  Zap,
  Bone,
  Activity,
  Brain,
  HeartHandshake,
  Scissors,
  Hand,
  Flower2,
  Quote,
  Phone,
  Wind,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import { usePullToRefresh } from 'use-pull-to-refresh';
import { Spinner } from '@/components/ui/Spinner';
import { useI18n } from '@/hooks/useI18n';
import { useVenues } from '@/hooks/useVenues';
import { useProviders } from '@/hooks/useProviders';
import { useTodayClasses, useTestimonials } from '@/hooks';
import type { MessageKey } from '@/i18n/messages';

// Types
interface Provider {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  specialties: string[];
  rating: number;
  reviewCount: number;
  yearsOfExperience: number;
  isVerified: boolean;
}

interface Venue {
  id: string;
  name: string;
  city: string;
  rating: number;
  reviews: number;
  distance: string;
  partner: boolean;
  specialties?: string[];
}

interface QuickActionItem {
  labelKey: MessageKey;
  icon: typeof Dumbbell;
  href: string;
}

interface VFunEvent {
  id: string;
  titleKey: MessageKey;
  date: string;
  time?: string;
  locationKey: MessageKey;
  price: string;
  tagKey?: MessageKey;
}

interface VFunTVShow {
  time: string;
  titleKey: MessageKey;
  channelKey: MessageKey;
  isLive: boolean;
}

// Static quick actions
const vlifeWellnessActions: QuickActionItem[] = [
  { labelKey: 'route.life.osteopatia.title', icon: Bone, href: '/life/osteopatia' },
  { labelKey: 'route.life.fisioterapia.title', icon: Activity, href: '/life/fisioterapia' },
  { labelKey: 'route.life.mentalCoach.title', icon: Brain, href: '/life/mental-coach' },
  { labelKey: 'route.life.psicologo.title', icon: HeartHandshake, href: '/life/psicologo' },
];

const vlifeEsteticaActions: QuickActionItem[] = [
  { labelKey: 'route.life.estetista.title', icon: Sparkles, href: '/life/estetista' },
  { labelKey: 'route.life.parrucchiere.title', icon: Scissors, href: '/life/parrucchiere' },
  { labelKey: 'route.life.unghie.title', icon: Hand, href: '/life/unghie' },
  { labelKey: 'route.life.massaggi.title', icon: Flower2, href: '/life/massaggi' },
];

// Static VFun content
const vfunUpcomingEvents: VFunEvent[] = [
  {
    id: 'pool-party',
    titleKey: 'home.fun.event.poolParty.title',
    date: '8 Feb',
    time: '14:00',
    locationKey: 'home.fun.event.poolParty.location',
    price: '€35',
    tagKey: 'home.fun.tag.hot',
  },
  {
    id: 'dj-night',
    titleKey: 'home.fun.event.djNight.title',
    date: '10 Feb',
    time: '23:00',
    locationKey: 'home.fun.event.djNight.location',
    price: '€50',
    tagKey: 'home.fun.tag.vip',
  },
  {
    id: 'fitness-rave',
    titleKey: 'home.fun.event.fitnessRave.title',
    date: '12 Feb',
    time: '20:00',
    locationKey: 'home.fun.event.fitnessRave.location',
    price: '€25',
    tagKey: 'home.fun.tag.new',
  },
];

const vfunTVSchedule: VFunTVShow[] = [
  {
    time: '10:00',
    titleKey: 'home.fun.tv.morningYoga',
    channelKey: 'home.fun.channel.wellness',
    isLive: false,
  },
  {
    time: '14:30',
    titleKey: 'home.fun.tv.hiitLive',
    channelKey: 'home.fun.channel.fit',
    isLive: true,
  },
  {
    time: '18:00',
    titleKey: 'home.fun.tv.cookingHealthy',
    channelKey: 'home.fun.channel.life',
    isLive: false,
  },
  {
    time: '21:00',
    titleKey: 'home.fun.tv.djSetLive',
    channelKey: 'home.fun.channel.fun',
    isLive: false,
  },
];

const vfunIsStreamingLive = true;

function VFitHome() {
  const { t } = useI18n();
  const { data: trainers = [], isLoading: loadingTrainers } = useProviders({ onlyVerified: true, limit: 6 });
  const { data: gyms = [], isLoading: loadingGyms } = useVenues({ type: 'gym', limit: 4 });
  const { data: classSessions = [], isLoading: loadingClasses } = useTodayClasses(3);

  // Fallback data while loading
  const displayTrainers = trainers.length > 0 ? trainers.slice(0, 3) : [];
  const displayGyms = gyms.length > 0 ? gyms : [];
  const featuredTrainers = displayTrainers.slice(0, 2);
  const activeClassTags = classSessions
    .map((session) => session.title)
    .filter((value, index, arr) => arr.indexOf(value) === index)
    .slice(0, 4);

  return (
    <div className="min-h-full bg-[#f3f4f6] pb-24">
      <div className="container-mobile py-4 space-y-5">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Dumbbell className="h-4 w-4 text-vfit-accent" />
              {t('home.fit.section.gymsLocations')}
            </h2>
            <Link href="/fit/gyms" className="text-sm font-medium text-vfit-accent">
              {t('home.fit.gyms.viewAll')}
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
            {loadingGyms ? (
              <div className="flex h-44 min-w-[240px] items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
                <Spinner size="md" />
              </div>
            ) : displayGyms.length > 0 ? (
              displayGyms.slice(0, 4).map((gym, index) => (
                <Link
                  key={gym.id}
                  href={`/venue?id=${gym.id}`}
                  className="min-w-[240px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                >
                  <div
                    className={cn(
                      'relative h-28 overflow-hidden',
                      index % 2 === 0
                        ? 'bg-gradient-to-br from-[#b98a64] via-[#8b5e3c] to-[#4b2d1f]'
                        : 'bg-gradient-to-br from-[#6b7280] via-[#374151] to-[#111827]'
                    )}
                  >
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(0,0,0,0.2))]" />
                    <div className="absolute left-4 top-4 h-12 w-20 rounded-md border border-white/20 bg-surface-2" />
                    <div className="absolute left-4 top-20 h-1.5 w-28 rounded-full bg-white/15" />
                    <div className="absolute right-3 top-3 flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-[10px] font-bold text-yellow-500">
                      <Star className="h-3 w-3 fill-current" />
                      {gym.rating.toFixed(1)}
                    </div>
                  </div>
                  <div className="p-3">
                    <h3 className="truncate text-sm font-semibold text-slate-900">{gym.name}</h3>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                      <MapPin className="h-3.5 w-3.5" />
                      {gym.city}
                    </p>
                  </div>
                </Link>
              ))
            ) : (
              <div className="flex min-w-[240px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
                <p className="text-sm text-slate-500">{t('home.fit.gyms.empty')}</p>
                <Link href="/booking" className="mt-2 text-sm font-medium text-vfit-accent">
                  {t('home.fit.gyms.findTrainer')}
                </Link>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-900">
            <Zap className="h-4 w-4 text-success-DEFAULT" />
            {t('home.fit.section.activeClasses')}
          </h3>
          {loadingClasses ? (
            <div className="flex items-center justify-center py-5">
              <Spinner size="md" />
            </div>
          ) : activeClassTags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {activeClassTags.map((tag, index) => (
                <span
                  key={`${tag}-${index}`}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium',
                    index === 0 && 'bg-purple-100 text-purple-700',
                    index === 1 && 'bg-blue-100 text-blue-700',
                    index === 2 && 'bg-pink-100 text-pink-700',
                    index === 3 && 'bg-orange-100 text-orange-700'
                  )}
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-500">{t('home.fit.classes.emptyToday')}</div>
          )}
        </section>

        <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="relative h-44 bg-[linear-gradient(135deg,#d8e4ea,#a6bdc8)]">
            <div className="absolute inset-0 opacity-55 [background-image:linear-gradient(to_right,rgba(255,255,255,0.45)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.45)_1px,transparent_1px)] [background-size:28px_28px]" />
            <div className="absolute left-12 top-10 h-16 w-20 rounded-lg bg-white/50" />
            <div className="absolute left-1/2 top-14 h-10 w-16 -translate-x-1/2 rounded-lg bg-white/45" />
            <div className="absolute right-10 top-8 h-12 w-14 rounded-lg bg-white/35" />
            <div className="absolute bottom-4 left-4 max-w-[55%] rounded-xl bg-black/45 px-3 py-2 text-white">
              <p className="text-sm font-bold">{t('home.fit.map.title')}</p>
              <p className="text-[11px] text-white/80">{t('home.fit.map.subtitle')}</p>
            </div>
            <div className="absolute right-4 top-4 rounded-full bg-white p-2 shadow">
              <MapPin className="h-4 w-4 text-vfit-accent" />
            </div>
            <div className="absolute bottom-4 right-4 rounded-lg bg-yellow-400 px-2 py-1 text-[10px] font-bold text-slate-900">
              {t('home.fit.partnerBadge')}
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div className="text-xs text-slate-500">{t('home.fit.map.locations', { count: 12 })}</div>
            <Link href="/fit/gyms" className="text-sm font-semibold text-vfit-accent">
              {t('home.fit.map.open')}
            </Link>
          </div>
        </section>

        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900 to-purple-900 p-5 text-white shadow-lg">
          <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-surface-2 blur-2xl" />
          <div className="absolute -left-8 -bottom-8 h-24 w-24 rounded-full bg-vfit-accent/35 blur-xl" />
          <div className="relative">
            <h3 className="text-xl font-bold">{t('home.fit.onlineCoach.title')}</h3>
            <p className="mt-1 text-sm text-indigo-200">{t('home.fit.onlineCoach.subtitle')}</p>

            <div className="mt-4 space-y-3">
              {loadingTrainers ? (
                <div className="flex items-center justify-center py-6">
                  <Spinner size="md" />
                </div>
              ) : featuredTrainers.length > 0 ? (
                featuredTrainers.map((trainer) => (
                  <Link
                    key={`coach-${trainer.id}`}
                    href={`/provider/${trainer.id}`}
                    className="flex items-center gap-3 rounded-xl border border-hairline bg-surface-2 p-3 backdrop-blur-sm transition-colors hover:bg-white/15"
                  >
                    <Avatar name={trainer.fullName} size="md" src={trainer.avatarUrl} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-content">{trainer.fullName}</p>
                        <div className="flex items-center gap-0.5 text-yellow-300">
                          <Star className="h-3.5 w-3.5 fill-current" />
                          <span className="text-[11px] font-semibold">{trainer.rating.toFixed(1)}</span>
                        </div>
                      </div>
                      <p className="truncate text-xs text-indigo-100/90">
                        {trainer.specialties[0] || t('home.fit.trainers.defaultSpecialty')}
                      </p>
                    </div>
                    <span className="rounded-lg bg-vfit-accent px-3 py-1.5 text-xs font-semibold text-white">
                      {t('common.bookNow')}
                    </span>
                  </Link>
                ))
              ) : (
                <div className="rounded-xl border border-hairline bg-surface-2 p-4 text-sm text-indigo-100">
                  {t('home.fit.trainers.empty')}
                </div>
              )}
            </div>

            <div className="mt-4 text-center">
              <Link href="/booking" className="inline-flex items-center gap-1 text-xs font-semibold text-white/90">
                {t('home.fit.onlineCoach.viewAll')}
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 p-4 text-white shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold">{t('home.fit.outdoorEvents.title')}</h3>
              <p className="text-xs text-emerald-50/90">{t('home.fit.outdoorEvents.subtitle')}</p>
            </div>
            <Gamepad2 className="h-7 w-7 opacity-80" />
          </div>
        </section>
      </div>
    </div>
  );
}

function VFunHome() {
  const { t } = useI18n();
  const scheduleItems = vfunUpcomingEvents.slice(0, 3);
  const liveShow = vfunTVSchedule.find((show) => show.isLive) ?? vfunTVSchedule[0];
  const crewMembers = [
    { name: 'Elena', roleKey: 'home.fun.crew.role.eventsLead' as MessageKey, accent: true },
    { name: 'Marco', roleKey: 'home.fun.crew.role.dj' as MessageKey, accent: false },
    { name: 'Sofia', roleKey: 'home.fun.crew.role.organizer' as MessageKey, accent: false },
    { name: 'Alex', roleKey: 'home.fun.crew.role.vrTech' as MessageKey, accent: false },
  ];

  return (
    <div className="min-h-full bg-[#f3f4f6] pb-24">
      <div className="container-mobile py-4 space-y-4">
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#4f1d95] via-[#5f2fb6] to-[#8b5cf6] p-5 text-white shadow-lg">
          <div className="absolute -top-8 right-0 h-28 w-28 rounded-full bg-pink-400/20 blur-2xl" />
          <div className="absolute -bottom-8 left-0 h-28 w-28 rounded-full bg-orange-400/20 blur-2xl" />
          <div className="relative text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 ring-4 ring-white/10">
              <PartyPopper className="h-7 w-7 text-pink-300" />
            </div>
            <h2 className="mt-4 text-2xl font-bold leading-tight">
              {t('home.fun.hero.titleLine1')}
              <br />
              <span className="bg-gradient-to-r from-pink-300 to-orange-300 bg-clip-text text-transparent">
                {t('home.fun.hero.titleLine2')}
              </span>
            </h2>
            <p className="mx-auto mt-2 max-w-[260px] text-xs text-white/80">
              {t('home.fun.hero.subtitle')}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Link
                href="/fun/party-mode"
                className="flex flex-col items-center gap-1 rounded-xl border border-white/15 bg-surface-2 px-3 py-3 text-xs font-semibold backdrop-blur-sm"
              >
                <PartyPopper className="h-4 w-4 text-pink-300" />
                {t('home.fun.hero.party')}
              </Link>
              <Link
                href="/fun/vr"
                className="flex flex-col items-center gap-1 rounded-xl border border-white/15 bg-surface-2 px-3 py-3 text-xs font-semibold backdrop-blur-sm"
              >
                <Glasses className="h-4 w-4 text-orange-300" />
                {t('home.fun.hero.vr')}
              </Link>
            </div>
          </div>
        </section>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {[
            { key: 'home.fun.tabs.calendar' as MessageKey, href: '/fun/events', active: true },
            { key: 'home.fun.tabs.party' as MessageKey, href: '/fun/party-mode' },
            { key: 'home.fun.tabs.events' as MessageKey, href: '/fun/events' },
            { key: 'home.fun.tabs.tv' as MessageKey, href: '/fun/tv' },
          ].map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              className={cn(
                'whitespace-nowrap rounded-full border px-4 py-2 text-xs font-medium shadow-sm',
                tab.active
                  ? 'border-vfun-primary bg-vfun-primary text-white shadow-vfun-primary/20'
                  : 'border-slate-200 bg-white text-slate-500'
              )}
            >
              {t(tab.key)}
            </Link>
          ))}
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">{t('home.fun.schedule.title')}</h3>
            <Link href="/fun/events" className="text-xs font-semibold text-vfun-primary">
              {t('home.fun.upcoming.viewAll')}
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {scheduleItems.map((event, index) => {
              const [day = '', month = ''] = event.date.split(' ');
              return (
                <Link
                  key={event.id}
                  href="/fun/events"
                  className="flex items-start gap-3 rounded-xl bg-slate-50 px-3 py-3 transition-colors hover:bg-slate-100"
                >
                  <div className="flex w-12 flex-shrink-0 flex-col items-center rounded-lg bg-white px-2 py-2 shadow-sm">
                    <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                      {month}
                    </span>
                    <span
                      className={cn(
                        'text-lg font-bold leading-none',
                        index === 0 && 'text-vfun-primary',
                        index === 1 && 'text-vfun-secondary',
                        index === 2 && 'text-vfun-accent'
                      )}
                    >
                      {day}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{t(event.titleKey)}</p>
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                      <Clock className="h-3 w-3" />
                      {event.time || '--'}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-slate-500">{t(event.locationKey)}</p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 text-slate-300" />
                </Link>
              );
            })}
          </div>
        </section>

        {vfunIsStreamingLive && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-3">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                </span>
                <p className="text-sm font-bold text-slate-800">{t('home.fun.live.badge')}</p>
              </div>
              <span className="rounded-md bg-purple-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-purple-600">
                TWITCH
              </span>
            </div>
            <div className="relative h-44 bg-[linear-gradient(135deg,#9db7bd,#7aa0a8)]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.35),_transparent_60%)]" />
              <div className="absolute left-1/2 top-1/2 h-16 w-28 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-white/85 shadow-lg" />
              <button
                type="button"
                className="absolute inset-0 flex items-center justify-center text-white/90"
                aria-label={t('home.fun.live.badge')}
              >
                <span className="rounded-full bg-vfun-primary/90 p-3 shadow-lg">
                  <Play className="h-5 w-5 fill-current" />
                </span>
              </button>
              <div className="absolute bottom-3 left-3 rounded-md bg-black/60 px-2 py-1 text-[10px] font-medium text-white">
                <span className="mr-1 text-red-400">●</span>
                {t('home.fun.live.viewerCount')}
              </div>
            </div>
            <div className="p-3">
              <p className="truncate text-sm font-semibold text-slate-800">{t('home.fun.live.title')}</p>
              <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                <Radio className="h-3.5 w-3.5" />
                {t(liveShow.channelKey)} · {t('home.fun.tv.onAir')}
              </p>
            </div>
          </section>
        )}

        <section>
          <h3 className="text-sm font-bold tracking-wide text-slate-800">{t('home.fun.crew.title')}</h3>
          <div className="mt-3 flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
            {crewMembers.map((member) => (
              <div key={`${member.name}-${member.roleKey}`} className="w-[86px] flex-shrink-0 text-center">
                <div
                  className={cn(
                    'mx-auto flex h-16 w-16 items-center justify-center rounded-full border p-0.5',
                    member.accent
                      ? 'border-pink-300 bg-gradient-to-br from-pink-300/40 to-orange-300/40'
                      : 'border-slate-200 bg-white'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-full w-full items-center justify-center rounded-full',
                      member.accent ? 'bg-white' : 'bg-gradient-to-br from-emerald-100 to-emerald-200'
                    )}
                  >
                    <Avatar name={member.name} size="sm" />
                  </div>
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-800">{member.name}</p>
                <p className="text-[10px] text-slate-500">{t(member.roleKey)}</p>
              </div>
            ))}
          </div>
        </section>

        <Link
          href="/fun/events"
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-vfun-primary to-vfun-secondary px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-vfun-primary/20"
        >
          <Glasses className="h-4 w-4" />
          {t('home.fun.catalog.explore')}
        </Link>
      </div>
    </div>
  );
}

function VLifeHome() {
  const { t } = useI18n();
  const { data: centers = [], isLoading: loadingCenters } = useVenues({ type: 'wellness_center', limit: 4 });
  const { data: testimonials = [], isLoading: loadingTestimonials } = useTestimonials({ limit: 3 });

  // Fallback testimonials (i18n-keyed, shown when Firestore returns empty)
  const fallbackTestimonials = [
    {
      id: '1',
      userName: 'Francesca M.',
      avatarUrl: null,
      serviceLabel: t('home.life.testimonials.f1.service'),
      rating: 5,
      text: t('home.life.testimonials.f1.text'),
      date: t('home.life.testimonials.f1.date'),
    },
    {
      id: '2',
      userName: 'Giovanni P.',
      avatarUrl: null,
      serviceLabel: t('home.life.testimonials.f2.service'),
      rating: 5,
      text: t('home.life.testimonials.f2.text'),
      date: t('home.life.testimonials.f2.date'),
    },
    {
      id: '3',
      userName: 'Laura B.',
      avatarUrl: null,
      serviceLabel: t('home.life.testimonials.f3.service'),
      rating: 4,
      text: t('home.life.testimonials.f3.text'),
      date: t('home.life.testimonials.f3.date'),
    },
  ];

  const displayTestimonials = testimonials.length > 0 ? testimonials : fallbackTestimonials;
  const displayCenters = centers.length > 0 ? centers : [];
  const recentTestimonials = displayTestimonials.slice(0, 2);
  const wellnessHighlights = vlifeWellnessActions.slice(0, 4);
  const beautyMenuItems = [
    { labelKey: 'route.life.estetista.title' as MessageKey, href: '/life/estetista' },
    { labelKey: 'route.life.parrucchiere.title' as MessageKey, href: '/life/parrucchiere' },
    { labelKey: 'home.life.beauty.promotions' as MessageKey, href: '/life/promotions' },
    { labelKey: 'route.life.unghie.title' as MessageKey, href: '/life/unghie' },
    { labelKey: 'home.life.beauty.barber' as MessageKey, href: '/life/parrucchiere' },
  ];

  return (
    <div className="min-h-full bg-[#f8fafc] pb-24">
      <div className="container-mobile py-4 space-y-4">
        <section className="grid grid-cols-2 gap-3">
          <div className="col-span-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-start justify-between">
              <h2 className="text-base font-semibold text-slate-800">{t('home.life.wellness.title')}</h2>
              <span className="rounded-lg bg-vlife-primary/10 p-1.5 text-vlife-primary">
                <Flower2 className="h-4 w-4" />
              </span>
            </div>
            <ul className="space-y-1.5 text-sm text-slate-600">
              {wellnessHighlights.map((item) => (
                <li key={item.href} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-vlife-primary" />
                  {t(item.labelKey)}
                </li>
              ))}
            </ul>
          </div>

          <Link
            href="/life/centers"
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-4 text-center shadow-sm"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <MapPin className="h-4 w-4" />
            </span>
            <span className="text-sm font-medium text-slate-700">{t('home.life.quickLocation')}</span>
          </Link>

          <Link
            href="/life/home-services"
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-4 text-center shadow-sm"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
              <HomeIcon className="h-4 w-4" />
            </span>
            <span className="text-sm font-medium text-slate-700">{t('home.life.quickHome')}</span>
          </Link>
        </section>

        <Link
          href="/life/massaggi"
          className="relative block overflow-hidden rounded-2xl border border-slate-200 shadow-sm"
        >
          <div className="h-28 bg-[linear-gradient(120deg,#3b2d24,#5a4033,_#1e3428)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_right,_rgba(255,255,255,0.2),_transparent_45%)]" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/25 to-transparent" />
            <div className="absolute left-4 top-4">
              <span className="rounded-md bg-orange-500/90 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-white">
                {t('home.life.hero.newService')}
              </span>
              <p className="mt-2 text-lg font-medium text-white">{t('home.life.hero.title')}</p>
              <p className="mt-1 text-[11px] text-white/80">{t('home.life.hero.subtitle')}</p>
            </div>
          </div>
        </Link>

        <section>
          <div className="relative mb-4 flex items-center justify-center">
            <div className="absolute inset-x-0 top-1/2 border-t border-slate-200" />
            <span className="relative bg-[#f8fafc] px-4 font-serif text-2xl italic text-vlife-primary">
              {t('home.life.beauty.title')}
            </span>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border-2 border-vlife-primary/20 bg-white p-1 shadow-sm">
              <div className="relative rounded-[14px] border border-vlife-primary/10 bg-white p-4">
                <div className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 rounded-tl-md border-l-2 border-t-2 border-vlife-primary/60" />
                <div className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 rounded-tr-md border-r-2 border-t-2 border-vlife-primary/60" />
                <div className="pointer-events-none absolute bottom-2 left-2 h-3.5 w-3.5 rounded-bl-md border-b-2 border-l-2 border-vlife-primary/60" />
                <div className="pointer-events-none absolute bottom-2 right-2 h-3.5 w-3.5 rounded-br-md border-b-2 border-r-2 border-vlife-primary/60" />

                <h3 className="text-center text-sm font-bold uppercase tracking-wide text-slate-800">
                  {t('home.life.beauty.menuTitle')}
                </h3>
                <div className="mt-4 space-y-2">
                  {beautyMenuItems.map((item) => (
                    <Link
                      key={`${item.labelKey}-${item.href}`}
                      href={item.href}
                      className="flex items-center justify-between rounded-lg px-1 py-1 text-sm text-slate-700 hover:text-vlife-primary"
                    >
                      <span>{t(item.labelKey)}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Quote className="h-4 w-4 text-amber-500" />
                <h4 className="text-sm font-semibold text-slate-800">{t('home.life.recentReviews.title')}</h4>
              </div>
              {loadingTestimonials ? (
                <div className="flex items-center justify-center py-4">
                  <Spinner size="md" />
                </div>
              ) : (
                <div className="space-y-3">
                  {recentTestimonials.map((testimonial) => (
                    <div key={testimonial.id} className="rounded-xl bg-slate-50 p-3">
                      <div className="mb-1 flex items-center gap-0.5 text-amber-400">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={`${testimonial.id}-${i}`}
                            className={cn(
                              'h-3 w-3',
                              i < testimonial.rating ? 'fill-current' : 'fill-none text-slate-300'
                            )}
                          />
                        ))}
                      </div>
                      <p className="line-clamp-2 text-xs italic text-slate-600">
                        &quot;{testimonial.text}&quot;
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Link
                href="/profile"
                className="relative flex flex-1 flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 p-3 text-white shadow-sm"
              >
                <span className="absolute -right-2 -top-2 rounded-full bg-white p-1 text-orange-500 shadow">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <span className="text-lg font-bold leading-none">VIP</span>
                <span className="mt-1 text-center text-[10px] font-semibold uppercase">
                  {t('home.life.vip.exclusiveDiscountShort')}
                </span>
              </Link>

              <Link
                href="/life/unghie"
                className="relative flex-[1.9] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="h-full min-h-[92px] bg-[linear-gradient(135deg,#f5c0b6,#c97d64,#9f5038)]">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.45),_transparent_50%)]" />
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
                  <p className="text-[10px] font-medium text-white">{t('home.life.gallery.nailArt')}</p>
                </div>
              </Link>
            </div>
          </div>
        </section>

        <Link
          href="/booking"
          className="flex items-center justify-center gap-2 rounded-xl bg-vlife-primary px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-vlife-primary/20"
        >
          <Phone className="h-4 w-4" />
          {t('home.life.contactQuote')}
          <ArrowUpRight className="h-4 w-4" />
        </Link>

        <section className="grid grid-cols-2 gap-3">
          {loadingCenters ? (
            <div className="col-span-2 flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-6 shadow-sm">
              <Spinner size="md" />
            </div>
          ) : (
            <>
              <Link
                href={displayCenters[0] ? `/venue?id=${displayCenters[0].id}` : '/life/centers'}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
              >
                <div className="h-20 rounded-xl bg-[linear-gradient(135deg,#3e8d68,#86c8a4)]" />
                <p className="mt-2 text-[11px] font-semibold text-slate-700">
                  {displayCenters[0]?.name || t('home.life.gallery.rehabPhoto')}
                </p>
              </Link>
              <Link
                href={displayCenters[1] ? `/venue?id=${displayCenters[1].id}` : '/life/hyperbaric'}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
              >
                <div className="relative h-20 rounded-xl bg-[linear-gradient(135deg,#dbe3ef,#aab7d2)]">
                  <div className="absolute right-2 top-2 rounded-full bg-white/80 p-1 text-vlife-primary">
                    <Wind className="h-3.5 w-3.5" />
                  </div>
                </div>
                <p className="mt-2 text-[11px] font-semibold text-slate-700">
                  {displayCenters[1]?.name || t('home.life.gallery.hyperbaricPhoto')}
                </p>
              </Link>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { section } = useSection();
  const { isRefreshing, pullPosition } = usePullToRefresh({
    onRefresh: () => new Promise(resolve => setTimeout(resolve, 2000)),
  });

  return (
    <main
      style={{
        transform: `translateY(${isRefreshing ? 60 : pullPosition}px)`,
        transition: 'transform 0.3s',
      }}
    >
      <div
        style={{
          position: 'fixed',
          top: '-60px',
          left: 0,
          right: 0,
          height: '60px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {isRefreshing ? (
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
        ) : (
          <div style={{ transform: `rotate(${pullPosition}deg)` }}>⬇️</div>
        )}
      </div>
      {section === 'fit' && <VFitHome />}
      {section === 'fun' && <VFunHome />}
      {section === 'life' && <VLifeHome />}
    </main>
  );
}

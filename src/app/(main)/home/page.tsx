'use client';

import Link from 'next/link';
import { useSection } from '@/contexts/SectionContext';
import {
  ArrowUpRight,
  ChevronRight,
  Clock,
  Dumbbell,
  Glasses,
  Home as HomeIcon,
  MapPin,
  PartyPopper,
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
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { cn, formatDecimal } from '@/lib/utils';
import { Spinner } from '@/components/ui/Spinner';
import { useI18n } from '@/hooks/useI18n';
import { useVenues } from '@/hooks/useVenues';
import { useProviders } from '@/hooks/useProviders';
import { useCustomerSearchLocation } from '@/hooks/useCustomerSearchLocation';
import { useNearbyVenues, type VenueWithDistance } from '@/hooks/useVenues';
import { useNearMe } from '@/hooks/useNearMe';
import { searchProvidersNear } from '@/lib/firebookings';
import type { LatLng } from '@/lib/geo';
import { useQuery } from '@tanstack/react-query';
import { useTodayClasses, useTestimonials } from '@/hooks';
import { useFunActivities } from '@/hooks/useFunActivities';
import type { MessageKey } from '@/i18n/messages';
import { providerProfileHref } from '@/lib/routes';

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

interface QuickActionItem {
  labelKey: MessageKey;
  icon: typeof Dumbbell;
  href: string;
}

// Static quick actions
const vlifeWellnessActions: QuickActionItem[] = [
  { labelKey: 'route.life.osteopatia.title', icon: Bone, href: '/life/osteopatia' },
  { labelKey: 'route.life.fisioterapia.title', icon: Activity, href: '/life/fisioterapia' },
  { labelKey: 'route.life.mentalCoach.title', icon: Brain, href: '/life/mental-coach' },
  { labelKey: 'route.life.psicologo.title', icon: HeartHandshake, href: '/life/psicologo' },
];

const NO_NEARBY_GYMS: VenueWithDistance[] = [];

function VFitHome() {
  const { t, locale } = useI18n();
  const { data: savedSearchLocation } = useCustomerSearchLocation();
  const { userLocation } = useNearMe(savedSearchLocation?.coords ?? null);
  const nearCenter = userLocation;
  const { data: nearbyGyms = NO_NEARBY_GYMS, isLoading: loadingNearbyGyms } = useNearbyVenues({
    type: 'gym',
    userLocation,
    radiusKm: 25,
  });
  const { data: catalogGyms = [], isLoading: loadingCatalogGyms } = useVenues({ type: 'gym', limit: 4 });
  const gyms = userLocation ? nearbyGyms : catalogGyms;
  const loadingGyms = userLocation ? loadingNearbyGyms : loadingCatalogGyms;
  const nearbyProvidersQuery = useQuery({
    queryKey: ['providers-near-home', nearCenter],
    queryFn: () => searchProvidersNear({}, nearCenter as LatLng, 25),
    enabled: nearCenter !== null,
    staleTime: 60 * 1000,
  });
  const { data: catalogTrainers = [], isLoading: loadingCatalogTrainers } = useProviders({
    onlyVerified: true,
    limit: 6,
  });
  const trainers = userLocation ? (nearbyProvidersQuery.data ?? []) : catalogTrainers;
  const loadingTrainers = userLocation ? nearbyProvidersQuery.isLoading : loadingCatalogTrainers;
  const { data: classSessions = [], isLoading: loadingClasses } = useTodayClasses(3);

  const displayTrainers = trainers.length > 0 ? trainers.slice(0, 3) : [];
  const displayGyms = gyms;
  const featuredTrainers = displayTrainers.slice(0, 2);
  const activeClassTags = classSessions
    .map((session) => session.title)
    .filter((value, index, arr) => arr.indexOf(value) === index)
    .slice(0, 4);

  return (
    <div className="min-h-full bg-background-dark pb-24">
      <div className="container-mobile py-4 space-y-5">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-content">
              <Dumbbell className="h-4 w-4 text-vfit-accent light:text-violet-700" />
              {t('home.fit.section.gymsLocations')}
            </h2>
            <Link href="/fit/gyms" className="text-sm font-medium text-vfit-accent light:text-violet-700">
              {t('home.fit.gyms.viewAll')}
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
            {loadingGyms ? (
              <div className="flex h-44 min-w-[240px] items-center justify-center rounded-2xl border border-hairline bg-surface shadow-sm">
                <Spinner size="md" />
              </div>
            ) : displayGyms.length > 0 ? (
              displayGyms.slice(0, 4).map((gym, index) => (
                <Link
                  key={gym.id}
                  href={`/venue?id=${gym.id}`}
                  className="min-w-[240px] overflow-hidden rounded-2xl border border-hairline bg-surface shadow-sm"
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
                    <div className="absolute left-4 top-4 h-12 w-20 rounded-md border border-white/20 light:border-white/20 bg-white/5 light:bg-white/5" />
                    <div className="absolute left-4 top-20 h-1.5 w-28 rounded-full bg-white/15" />
                    {gym.rating > 0 && <div className="absolute right-3 top-3 flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-[10px] font-bold text-amber-600">
                      <Star className="h-3 w-3 fill-current" />
                      {formatDecimal(gym.rating, locale, 1)}{gym.reviewCount > 0 ? ` (${gym.reviewCount})` : ''}
                    </div>}
                  </div>
                  <div className="p-3">
                    <h3 className="truncate text-sm font-semibold text-content">{gym.name}</h3>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-content-muted">
                      <MapPin className="h-3.5 w-3.5" />
                      {gym.city}
                    </p>
                  </div>
                </Link>
              ))
            ) : (
              <div className="flex min-w-[240px] flex-col items-center justify-center rounded-2xl border border-hairline bg-surface p-4 text-center shadow-sm">
                <p className="text-sm text-content-muted">{t('home.fit.gyms.empty')}</p>
                <Link href="/booking" className="mt-2 text-sm font-medium text-vfit-accent light:text-violet-700">
                  {t('home.fit.gyms.findTrainer')}
                </Link>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-hairline bg-surface p-4 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-content">
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
                    index === 0 && 'bg-purple-500/15 text-purple-300 light:text-purple-700',
                    index === 1 && 'bg-blue-500/15 text-blue-300 light:text-blue-700',
                    index === 2 && 'bg-pink-500/15 text-pink-300 light:text-pink-700',
                    index === 3 && 'bg-orange-500/15 text-orange-300 light:text-orange-700'
                  )}
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-sm text-content-muted">{t('home.fit.classes.emptyToday')}</div>
          )}
        </section>

        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900 to-purple-900 p-5 text-white shadow-lg">
          <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/5 light:bg-white/5 blur-2xl" />
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
                    href={providerProfileHref(trainer.id)}
                    className="flex items-center gap-3 rounded-xl border border-white/10 light:border-white/10 bg-white/5 light:bg-white/5 p-3 backdrop-blur-sm transition-colors hover:bg-white/15"
                  >
                    <Avatar name={trainer.fullName} size="md" src={trainer.avatarUrl} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-white">{trainer.fullName}</p>
                        {trainer.rating > 0 && <div className="flex items-center gap-0.5 text-yellow-300">
                          <Star className="h-3.5 w-3.5 fill-current" />
                          <span className="text-[11px] font-semibold">{formatDecimal(trainer.rating, locale, 1)}{trainer.reviewCount > 0 ? ` (${trainer.reviewCount})` : ''}</span>
                        </div>}
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
                <div className="rounded-xl border border-white/10 light:border-white/10 bg-white/5 light:bg-white/5 p-4 text-sm text-indigo-100">
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

      </div>
    </div>
  );
}

function VFunHome() {
  const { t } = useI18n();
  const { data: events = [], isLoading: loadingEvents } = useFunActivities('event');

  return (
    <div className="min-h-full bg-background-dark pb-24">
      <div className="container-mobile py-4 space-y-4">
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#4f1d95] via-[#5f2fb6] to-[#8b5cf6] p-5 text-white shadow-lg">
          <div className="absolute -top-8 right-0 h-28 w-28 rounded-full bg-pink-400/20 blur-2xl" />
          <div className="absolute -bottom-8 left-0 h-28 w-28 rounded-full bg-orange-400/20 blur-2xl" />
          <div className="relative text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/5 light:bg-white/5 ring-4 ring-white/10">
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
                className="flex flex-col items-center gap-1 rounded-xl border border-white/15 bg-white/5 light:bg-white/5 px-3 py-3 text-xs font-semibold backdrop-blur-sm"
              >
                <PartyPopper className="h-4 w-4 text-pink-300" />
                {t('home.fun.hero.party')}
              </Link>
              <Link
                href="/fun/vr"
                className="flex flex-col items-center gap-1 rounded-xl border border-white/15 bg-white/5 light:bg-white/5 px-3 py-3 text-xs font-semibold backdrop-blur-sm"
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
                  : 'border-hairline bg-surface text-content-muted'
              )}
            >
              {t(tab.key)}
            </Link>
          ))}
        </div>

        <section className="rounded-2xl border border-hairline bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-content">{t('home.fun.schedule.title')}</h3>
            <Link href="/fun/events" className="text-xs font-semibold text-vfun-primary light:text-purple-700">{t('home.fun.upcoming.viewAll')}</Link>
          </div>
          <div className="mt-3 space-y-2">
            {loadingEvents && <div className="flex justify-center py-4"><Spinner size="md" /></div>}
            {!loadingEvents && events.length === 0 && <p className="rounded-xl bg-content/5 p-3 text-sm text-content-muted">{t('funRoute.events.empty')}</p>}
            {events.slice(0, 3).map((event) => (
              <Link key={event.id} href="/fun/events" className="block rounded-xl bg-content/5 px-3 py-3">
                <p className="truncate text-sm font-semibold text-content">{event.fullName}</p>
                {(event.eventDate || event.eventTime) && <p className="mt-1 flex items-center gap-1 text-[11px] text-content-muted"><Clock className="h-3 w-3" />{[event.eventDate, event.eventTime].filter(Boolean).join(' · ')}</p>}
                {event.location && <p className="mt-1 truncate text-[11px] text-content-muted">{event.location}</p>}
              </Link>
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
  const { data: testimonials = [], isLoading: loadingTestimonials } = useTestimonials({ limit: 3 });

  const recentTestimonials = testimonials.slice(0, 2);
  const wellnessHighlights = vlifeWellnessActions.slice(0, 4);
  const beautyMenuItems = [
    { labelKey: 'route.life.estetista.title' as MessageKey, href: '/life/estetista' },
    { labelKey: 'route.life.parrucchiere.title' as MessageKey, href: '/life/parrucchiere' },
    { labelKey: 'route.life.unghie.title' as MessageKey, href: '/life/unghie' },
  ];

  return (
    <div className="min-h-full bg-background-dark pb-24">
      <div className="container-mobile py-4 space-y-4">
        <section className="grid grid-cols-2 gap-3">
          <div className="col-span-2 rounded-2xl border border-hairline bg-surface p-4 shadow-sm">
            <div className="mb-2 flex items-start justify-between">
              <h2 className="text-base font-semibold text-content">{t('home.life.wellness.title')}</h2>
              <span className="rounded-lg bg-vlife-primary/10 p-1.5 text-vlife-primary light:text-emerald-700">
                <Flower2 className="h-4 w-4" />
              </span>
            </div>
            <ul className="space-y-1.5 text-sm text-content/80">
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
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-hairline bg-surface px-3 py-4 text-center shadow-sm"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300 light:text-emerald-700">
              <MapPin className="h-4 w-4" />
            </span>
            <span className="text-sm font-medium text-content/80">{t('home.life.quickLocation')}</span>
          </Link>

          <Link
            href="/life/home-services"
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-hairline bg-surface px-3 py-4 text-center shadow-sm"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/15 text-blue-300 light:text-blue-700">
              <HomeIcon className="h-4 w-4" />
            </span>
            <span className="text-sm font-medium text-content/80">{t('home.life.quickHome')}</span>
          </Link>
        </section>

        <section>
          <div className="relative mb-4 flex items-center justify-center">
            <div className="absolute inset-x-0 top-1/2 border-t border-hairline" />
            <span className="relative bg-background-dark px-4 font-serif text-2xl italic text-vlife-primary light:text-emerald-700">
              {t('home.life.beauty.title')}
            </span>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border-2 border-vlife-primary/20 bg-surface p-1 shadow-sm">
              <div className="relative rounded-[14px] border border-vlife-primary/10 bg-surface p-4">
                <div className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 rounded-tl-md border-l-2 border-t-2 border-vlife-primary/60" />
                <div className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 rounded-tr-md border-r-2 border-t-2 border-vlife-primary/60" />
                <div className="pointer-events-none absolute bottom-2 left-2 h-3.5 w-3.5 rounded-bl-md border-b-2 border-l-2 border-vlife-primary/60" />
                <div className="pointer-events-none absolute bottom-2 right-2 h-3.5 w-3.5 rounded-br-md border-b-2 border-r-2 border-vlife-primary/60" />

                <h3 className="text-center text-sm font-bold uppercase tracking-wide text-content">
                  {t('home.life.beauty.menuTitle')}
                </h3>
                <div className="mt-4 space-y-2">
                  {beautyMenuItems.map((item) => (
                    <Link
                      key={`${item.labelKey}-${item.href}`}
                      href={item.href}
                      className="flex items-center justify-between rounded-lg px-1 py-1 text-sm text-content/80 hover:text-vlife-primary light:hover:text-emerald-700"
                    >
                      <span>{t(item.labelKey)}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-content-muted" />
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-hairline bg-surface p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Quote className="h-4 w-4 text-amber-500" />
                <h4 className="text-sm font-semibold text-content">{t('home.life.recentReviews.title')}</h4>
              </div>
              {loadingTestimonials ? (
                <div className="flex items-center justify-center py-4">
                  <Spinner size="md" />
                </div>
              ) : recentTestimonials.length > 0 ? (
                <div className="space-y-3">
                  {recentTestimonials.map((testimonial) => (
                    <div key={testimonial.id} className="rounded-xl bg-content/5 p-3">
                      <div className="mb-1 flex items-center gap-0.5 text-amber-400">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={`${testimonial.id}-${i}`}
                            className={cn(
                              'h-3 w-3',
                              i < testimonial.rating ? 'fill-current' : 'fill-none text-content/25'
                            )}
                          />
                        ))}
                      </div>
                      <p className="line-clamp-2 text-xs italic text-content/80">
                        &quot;{testimonial.text}&quot;
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex gap-3">
              <Link href="/life/estetista" className="flex min-h-24 w-full items-center justify-center rounded-2xl border border-hairline bg-surface p-3 text-center text-xs font-semibold text-content/80">
                {t('route.life.estetista.title')}
              </Link>
            </div>
          </div>
        </section>

        <Link
          href="/booking"
          className="flex items-center justify-center gap-2 rounded-xl bg-vlife-primary px-4 py-3 text-sm font-semibold text-[#0B1220] shadow-lg shadow-vlife-primary/20"
        >
          <Phone className="h-4 w-4" />
          {t('common.bookNow')}
          <ArrowUpRight className="h-4 w-4" />
        </Link>


      </div>
    </div>
  );
}

export default function HomePage() {
  const { section } = useSection();
  // A div: MainLayout already provides the page's one <main> landmark.
  return (
    <div>
      {section === 'fit' && <VFitHome />}
      {section === 'fun' && <VFunHome />}
      {section === 'life' && <VLifeHome />}
    </div>
  );
}

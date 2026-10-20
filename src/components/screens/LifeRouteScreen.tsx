'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowUpRight, MapPin, ShieldCheck, Sparkles, Star, Wind } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { LIFE_ROUTE_CONTENT, type LifeRouteSlug } from '@/lib/featureRouteContent';
import { useI18n } from '@/hooks/useI18n';
import { useProviders } from '@/hooks/useProviders';
import { useVenues } from '@/hooks/useVenues';
import { useServiceCategoryMap } from '@/hooks/useServiceCategories';
import type { Provider } from '@/types/instructor';
import { providerProfileHref } from '@/lib/routes';
import { venueAddressText } from '@/lib/venueAddress';

type ProviderSlug = Exclude<LifeRouteSlug, 'home-services' | 'centers' | 'hyperbaric'>;

const providerCategoryBySlug: Record<ProviderSlug, string> = {
  osteopatia: 'osteopathy',
  fisioterapia: 'physio',
  'mental-coach': 'mental_coaching',
  psicologo: 'psychology',
  estetista: 'esthetician',
  parrucchiere: 'hairdresser',
  unghie: 'nail_technician',
  massaggi: 'massage',
};

const homeServiceCategoryIds = [
  'home_maintenance',
  'beauty_personal_care',
  'therapy_recovery',
  'nutrition_lifestyle',
];

function matchesQuery(value: string | undefined, query: string): boolean {
  return (value ?? '').toLocaleLowerCase().includes(query);
}

function ProviderCard({ provider }: { provider: Provider }) {
  return (
    <Link
      href={providerProfileHref(provider.id)}
      className="block rounded-2xl border border-hairline bg-content/5 p-4 transition-colors hover:bg-content/10"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-text-inverse">{provider.fullName}</h2>
          {provider.specialties.length > 0 && (
            <p className="mt-1 truncate text-xs text-text-tertiary">{provider.specialties.join(', ')}</p>
          )}
          {provider.city && <p className="mt-1 text-xs text-text-tertiary">{provider.city}</p>}
        </div>
        {provider.isVerified && (
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-label="Verified" />
        )}
      </div>
      {provider.rating > 0 && (
        <p className="mt-3 flex items-center gap-1 text-xs text-text-tertiary">
          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
          {provider.rating.toLocaleString()} {provider.reviewCount > 0 ? `(${provider.reviewCount})` : ''}
        </p>
      )}
    </Link>
  );
}

export function LifeRouteScreen({ slug }: { slug: LifeRouteSlug }) {
  const { t } = useI18n();
  const content = LIFE_ROUTE_CONTENT[slug];
  const Icon = content?.icon ?? Sparkles;
  const [query, setQuery] = useState('');
  const categoryMap = useServiceCategoryMap();
  const providerSlug = slug in providerCategoryBySlug ? (slug as ProviderSlug) : null;
  const providerCategoryId = providerSlug ? providerCategoryBySlug[providerSlug] : undefined;
  const providersQuery = useProviders({
    categoryId: providerCategoryId,
    onlyVerified: true,
    limit: 100,
    enabled: !!providerCategoryId,
  });
  const centersQuery = useVenues({ type: 'wellness_center', limit: 50, enabled: slug === 'centers' });

  const providers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return (providersQuery.data ?? []).filter((provider) =>
      !normalizedQuery ||
      matchesQuery(provider.fullName, normalizedQuery) ||
      matchesQuery(provider.city, normalizedQuery) ||
      provider.specialties.some((specialty) => matchesQuery(specialty, normalizedQuery))
    );
  }, [providersQuery.data, query]);

  const centers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return (centersQuery.data ?? []).filter((center) =>
      !normalizedQuery ||
      matchesQuery(center.name, normalizedQuery) ||
      matchesQuery(center.city, normalizedQuery) ||
      matchesQuery(venueAddressText(center), normalizedQuery)
    );
  }, [centersQuery.data, query]);

  return (
    <div className="container-mobile space-y-6 py-6 pb-24">
      <section className="relative overflow-hidden rounded-3xl border border-hairline bg-content/5 p-5">
        <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-section-primary/20 blur-2xl" />
        <div className="absolute -bottom-12 left-0 h-32 w-32 rounded-full bg-section-secondary/20 blur-3xl" />
        <div className="relative">
          <span className="inline-flex items-center rounded-full border border-content/15 bg-content/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
            {t('lifeRoute.badge')}
          </span>
          <div className="mt-4 flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-section-primary/20 text-section-primary">
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold text-text-inverse">{t(content.titleKey)}</h1>
              <p className="mt-1 text-sm text-text-secondary">{t(content.descriptionKey)}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/home" className="min-h-11 rounded-full border border-content/15 bg-content/10 px-4 py-3 text-xs font-semibold text-text-inverse">
              {t('common.backToHome')}
            </Link>
            <Link href="/booking" className="min-h-11 rounded-full bg-section-primary px-4 py-3 text-xs font-semibold text-background-dark light:text-content">
              {t('lifeRoute.actions.bookService')}
            </Link>
          </div>
        </div>
      </section>

      {(providerSlug || slug === 'centers') && (
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t(slug === 'centers' ? 'lifeRoute.search.centersPlaceholder' : 'lifeRoute.search.providersPlaceholder')}
          aria-label={t(slug === 'centers' ? 'lifeRoute.search.centersPlaceholder' : 'lifeRoute.search.providersPlaceholder')}
        />
      )}

      {providerSlug && (
        <section className="space-y-3" aria-live="polite">
          {providersQuery.isLoading && (
            <p className="rounded-2xl border border-hairline bg-content/5 p-4 text-sm text-text-tertiary">{t('common.loading')}</p>
          )}
          {!providersQuery.isLoading && providers.map((provider) => <ProviderCard key={provider.id} provider={provider} />)}
          {!providersQuery.isLoading && providers.length === 0 && (
            <p className="rounded-2xl border border-hairline bg-content/5 p-4 text-sm text-text-tertiary">{t('lifeRoute.provider.empty')}</p>
          )}
        </section>
      )}

      {slug === 'centers' && (
        <section className="space-y-3" aria-live="polite">
          {centersQuery.isLoading && (
            <p className="rounded-2xl border border-hairline bg-content/5 p-4 text-sm text-text-tertiary">{t('common.loading')}</p>
          )}
          {!centersQuery.isLoading && centers.map((center) => (
            <Link key={center.id} href={`/venue?id=${encodeURIComponent(center.id)}`} className="block rounded-2xl border border-hairline bg-content/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-text-inverse">{center.name}</h2>
                  <p className="mt-1 flex items-center gap-1 text-xs text-text-tertiary"><MapPin className="h-3.5 w-3.5" />{center.city}</p>
                </div>
                {center.isPartner && <span className="inline-flex items-center gap-1 rounded-full bg-content/90 px-2 py-1 text-[10px] font-semibold uppercase text-background-dark"><ShieldCheck className="h-3 w-3" />{t('lifeRoute.partnerBadge')}</span>}
              </div>
              {center.rating > 0 && <p className="mt-3 flex items-center gap-1 text-xs text-text-tertiary"><Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />{center.rating.toLocaleString()}{center.reviewCount > 0 ? ` (${center.reviewCount})` : ''}</p>}
            </Link>
          ))}
          {!centersQuery.isLoading && centers.length === 0 && (
            <p className="rounded-2xl border border-hairline bg-content/5 p-4 text-sm text-text-tertiary">{t('lifeRoute.centers.empty')}</p>
          )}
        </section>
      )}

      {slug === 'home-services' && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-hairline bg-content/5 p-4">
            <h2 className="text-base font-semibold text-text-inverse">{t('lifeRoute.homeServices.title')}</h2>
            <p className="mt-1 text-sm text-text-secondary">{t('lifeRoute.homeServices.description')}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {homeServiceCategoryIds.map((categoryId) => {
              const category = categoryMap.get(categoryId);
              if (!category) return null;
              return (
                <Link key={categoryId} href={`/booking?category=${encodeURIComponent(categoryId)}`} className="flex min-h-14 items-center justify-between rounded-2xl border border-hairline bg-content/5 p-4 text-sm font-semibold text-text-inverse">
                  <span className="flex items-center gap-2"><span aria-hidden="true">{category.icon}</span>{category.name}</span>
                  <ArrowUpRight className="h-4 w-4 text-section-primary" />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {slug === 'hyperbaric' && (
        <section className="rounded-2xl border border-hairline bg-content/5 p-4">
          <div className="flex items-center gap-2"><Wind className="h-5 w-5 text-cyan-300 light:text-cyan-700" /><h2 className="text-base font-semibold text-text-inverse">{t('lifeRoute.hyperbaric.title')}</h2></div>
          <p className="mt-2 text-sm text-text-secondary">{t('lifeRoute.hyperbaric.description')}</p>
        </section>
      )}

      {slug !== 'hyperbaric' && (
        <Link href="/booking" className={cn('inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-section-primary/20 px-4 py-3 text-sm font-semibold text-section-primary')}>
          {t('lifeRoute.actions.bookService')}<ArrowUpRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

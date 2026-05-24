'use client';

import Link from 'next/link';
import { useMemo, useState, useCallback } from 'react';
import { List, Map as MapIcon, MapPin, Search, SlidersHorizontal, Star, Navigation } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GoogleMap } from '@/components/map/GoogleMap';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/hooks/useI18n';
import type { MessageKey } from '@/i18n/messages';
import { useVenues } from '@/hooks/useVenues';
import { Spinner } from '@/components/ui/Spinner';
import { PhotoCover } from '@/components/gallery/PhotoCover';

const filterKeys: MessageKey[] = [
  'fit.gyms.filter.distance',
  'fit.gyms.filter.rating',
  'fit.gyms.filter.amenities',
  'fit.gyms.filter.price',
];

type SortOption = 'nearest' | 'top' | 'price';

const sortLabels: Record<SortOption, MessageKey> = {
  nearest: 'fit.gyms.sort.nearest',
  top: 'fit.gyms.sort.top',
  price: 'fit.gyms.sort.price',
};

const sortOptions: SortOption[] = ['nearest', 'top', 'price'];

export default function GymsPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [view, setView] = useState<'list' | 'map'>('list');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortOption>('nearest');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | undefined>();

  const { data: gyms = [], isLoading: gymsLoading } = useVenues({ type: 'gym' });

  const handleSort = () => {
    const currentIndex = sortOptions.indexOf(sort);
    const nextSort = sortOptions[(currentIndex + 1) % sortOptions.length];
    setSort(nextSort);
  };

  const handleGetLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.error('Geolocation error:', error);
        }
      );
    }
  };

  const handleGymSelect = useCallback((gymId: string) => {
    router.push(`/venue?id=${gymId}`);
  }, [router]);

  const filteredGyms = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const results = gyms.filter((gym) => {
      if (!normalizedQuery) return true;
      return (
        gym.name.toLowerCase().includes(normalizedQuery) ||
        gym.city.toLowerCase().includes(normalizedQuery)
      );
    });

    return results.sort((a, b) => {
      if (sort === 'top') {
        return b.rating - a.rating;
      }
      // price and nearest sorting require fields not in Firestore schema; fall back to rating
      return b.rating - a.rating;
    });
  }, [query, sort, gyms]);

  return (
    <div className="min-h-screen bg-background-dark pb-24">
      <div className="container-mobile py-6 space-y-6">
        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-text-inverse">{t('fit.gyms.title')}</h1>
          <p className="text-sm text-text-tertiary">
            {t('fit.gyms.subtitle')}
          </p>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('fit.gyms.searchPlaceholder')}
              className={cn(
                'w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-11 pr-12',
                'text-sm text-text-inverse placeholder:text-text-tertiary',
                'focus:outline-none focus:ring-2 focus:ring-[var(--section-primary)]'
              )}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-text-tertiary"
              >
                {t('fit.gyms.clear')}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {filterKeys.map((filterKey) => (
              <button
                key={filterKey}
                type="button"
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-text-tertiary hover:bg-white/10 transition-colors"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {t(filterKey)}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1">
              <button
                type="button"
                onClick={() => setView('list')}
                className={cn(
                  'flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition-colors',
                  view === 'list'
                    ? 'bg-section-primary text-background-dark'
                    : 'text-text-tertiary'
                )}
                  >
                    <List className="h-4 w-4" />
                    {t('fit.gyms.view.list')}
                  </button>
              <button
                type="button"
                onClick={() => setView('map')}
                className={cn(
                  'flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition-colors',
                  view === 'map'
                    ? 'bg-section-primary text-background-dark'
                    : 'text-text-tertiary'
                )}
                  >
                    <MapIcon className="h-4 w-4" />
                    {t('fit.gyms.view.map')}
                  </button>
                </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleGetLocation}
                className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-text-tertiary hover:bg-white/10 transition-colors"
                title={t('fit.gyms.location.useMyLocation')}
              >
                <Navigation className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t('fit.gyms.location.label')}</span>
              </button>
              <button
                type="button"
                onClick={handleSort}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-text-tertiary hover:bg-white/10 transition-colors"
              >
                {t(sortLabels[sort])}
              </button>
            </div>
          </div>
        </div>

        {gymsLoading ? (
          <div className="flex justify-center p-8"><Spinner size="md" /></div>
        ) : view === 'list' ? (
          <div className="space-y-4">
            {filteredGyms.map((gym) => (
              <Link
                key={gym.id}
                href={`/venue?id=${gym.id}`}
                className="block overflow-hidden rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
              >
                <div className="relative">
                  <PhotoCover
                    src={gym.photoUrls?.[0]}
                    alt={gym.name}
                    className="h-28"
                    fallback={
                      <div className="h-28 bg-gradient-to-br from-vfit-secondary/40 via-vfit-primary/30 to-transparent" />
                    }
                  />
                  {gym.isPartner && (
                    <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold uppercase text-background-dark">
                      {t('fit.gyms.partner')}
                    </span>
                  )}
                  <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-background-dark/80 px-2 py-1 text-[11px] text-white">
                    <Star className="h-3 w-3 text-yellow-400" />
                    {gym.rating.toFixed(1)}
                  </div>
                </div>
                <div className="space-y-2 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-text-inverse">
                        {gym.name}
                      </h3>
                      <p className="text-xs text-text-tertiary">{gym.city}</p>
                    </div>
                    <span className="text-xs text-text-tertiary">
                      {'—'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {gym.amenities.map((a) => (
                      <span
                        key={a.kind}
                        className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-text-tertiary"
                      >
                        {a.kind}
                      </span>
                    ))}
                    <span className="rounded-full bg-section-primary/15 px-2.5 py-1 text-[11px] font-semibold text-section-primary">
                      {t('fit.gyms.reviews', { count: gym.reviewCount })}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <GoogleMap
              gyms={filteredGyms}
              userLocation={userLocation}
              onGymSelect={handleGymSelect}
              className="h-[60vh] min-h-[500px]"
            />

            {/* Gym list below map */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-text-inverse">
                {t('fit.gyms.nearby', { count: filteredGyms.length })}
              </h3>
              {filteredGyms.map((gym) => (
                <Link
                  key={gym.id}
                  href={`/venue?id=${gym.id}`}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-section-primary/20 flex items-center justify-center">
                      <MapPin className="h-5 w-5 text-section-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text-inverse">
                        {gym.name}
                      </p>
                      <p className="text-xs text-text-tertiary">{gym.city}</p>
                    </div>
                  </div>
                  <div className="text-right text-xs text-text-tertiary">
                    <div className="flex items-center justify-end gap-1 text-text-inverse">
                      <Star className="h-3 w-3 text-yellow-400" />
                      {gym.rating.toFixed(1)}
                    </div>
                    <span>{'—'}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

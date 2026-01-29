'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { List, Map, MapPin, Search, SlidersHorizontal, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

const gyms = [
  {
    id: 'carosello',
    name: 'Carosello Fitness',
    city: 'Milano Centro',
    rating: 4.8,
    reviews: 124,
    distanceKm: 1.2,
    amenities: ['Sauna', 'Pool'],
    priceLevel: 2,
    partner: true,
  },
  {
    id: 'urban-core',
    name: 'Urban Core Gym',
    city: 'Porta Nuova',
    rating: 4.9,
    reviews: 98,
    distanceKm: 2.4,
    amenities: ['CrossFit', 'Boxing'],
    priceLevel: 3,
    partner: false,
  },
  {
    id: 'village-fit',
    name: 'Village Fit Club',
    city: 'Navigli',
    rating: 4.7,
    reviews: 142,
    distanceKm: 3.1,
    amenities: ['Yoga', 'Spa'],
    priceLevel: 1,
    partner: true,
  },
  {
    id: 'pulse-studio',
    name: 'Pulse Studio',
    city: 'Isola',
    rating: 4.6,
    reviews: 67,
    distanceKm: 3.8,
    amenities: ['Pilates', 'HIIT'],
    priceLevel: 2,
    partner: false,
  },
];

const filters = ['Distanza', 'Rating', 'Servizi', 'Prezzo'];

type SortOption = 'nearest' | 'top' | 'price';

const sortLabels: Record<SortOption, string> = {
  nearest: 'Piu vicine',
  top: 'Piu votate',
  price: 'Prezzo basso-alto',
};

const sortOptions: SortOption[] = ['nearest', 'top', 'price'];

export default function GymsPage() {
  const [view, setView] = useState<'list' | 'map'>('list');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortOption>('nearest');

  const handleSort = () => {
    const currentIndex = sortOptions.indexOf(sort);
    const nextSort = sortOptions[(currentIndex + 1) % sortOptions.length];
    setSort(nextSort);
  };

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
      if (sort === 'price') {
        return a.priceLevel - b.priceLevel;
      }
      return a.distanceKm - b.distanceKm;
    });
  }, [query, sort]);

  return (
    <div className="min-h-screen bg-background-dark pb-24">
      <div className="container-mobile py-6 space-y-6">
        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-text-inverse">Palestre</h1>
          <p className="text-sm text-text-tertiary">
            Trova la palestra perfetta vicino a te.
          </p>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cerca palestre, quartieri, servizi..."
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
                Cancella
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {filters.map((filter) => (
              <button
                key={filter}
                type="button"
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-text-tertiary"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {filter}
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
                Lista
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
                <Map className="h-4 w-4" />
                Mappa
              </button>
            </div>

            <button
              type="button"
              onClick={handleSort}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-text-tertiary"
            >
              {sortLabels[sort]}
            </button>
          </div>
        </div>

        {view === 'list' ? (
          <div className="space-y-4">
            {filteredGyms.map((gym) => (
              <Link
                key={gym.id}
                href={`/venue/${gym.id}`}
                className="block overflow-hidden rounded-2xl border border-white/10 bg-white/5"
              >
                <div className="relative h-32 bg-gradient-to-br from-vfit-secondary/40 via-vfit-primary/25 to-transparent">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.2),_transparent_65%)]" />
                  {gym.partner && (
                    <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold uppercase text-background-dark">
                      Partner
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
                      {gym.distanceKm.toFixed(1)} km
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {gym.amenities.map((amenity) => (
                      <span
                        key={amenity}
                        className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-text-tertiary"
                      >
                        {amenity}
                      </span>
                    ))}
                    <span className="rounded-full bg-section-primary/15 px-2.5 py-1 text-[11px] font-semibold text-section-primary">
                      {gym.reviews} recensioni
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5">
              <div className="relative h-60 bg-[radial-gradient(circle_at_top,_rgba(0,201,255,0.12),_transparent_60%)]">
                <div className="absolute inset-0 bg-[linear-gradient(135deg,_rgba(0,102,255,0.15),_rgba(123,97,255,0.1))]" />
                {filteredGyms.slice(0, 3).map((gym, index) => (
                  <div
                    key={gym.id}
                    className={cn(
                      'absolute flex flex-col items-center gap-1',
                      index === 0 && 'left-1/4 top-12',
                      index === 1 && 'right-1/4 top-20',
                      index === 2 && 'left-1/2 bottom-12'
                    )}
                  >
                    <div className="rounded-full bg-background-dark/80 px-2 py-1 text-[10px] text-text-inverse">
                      {gym.name}
                    </div>
                    <MapPin className="h-6 w-6 text-section-primary" />
                  </div>
                ))}
                <div className="absolute right-4 bottom-4 rounded-full bg-section-primary/20 px-3 py-1 text-xs font-semibold text-section-primary">
                  {filteredGyms.length} sedi
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {filteredGyms.map((gym) => (
                <Link
                  key={gym.id}
                  href={`/venue/${gym.id}`}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-text-inverse">
                      {gym.name}
                    </p>
                    <p className="text-xs text-text-tertiary">{gym.city}</p>
                  </div>
                  <div className="text-right text-xs text-text-tertiary">
                    <div className="flex items-center justify-end gap-1 text-text-inverse">
                      <Star className="h-3 w-3 text-yellow-400" />
                      {gym.rating.toFixed(1)}
                    </div>
                    <span>{gym.distanceKm.toFixed(1)} km</span>
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

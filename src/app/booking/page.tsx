'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Filter,
  Map as MapIcon,
  List,
  Star,
  MapPin,
  ChevronRight,
  SlidersHorizontal,
  X,
  Clock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, formatPrice } from '@/lib/utils';
import { useBookingStore } from '@/stores/bookingStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { GoogleMap } from '@/components/map/GoogleMap';
import type { ProviderSearchResult, SearchParams } from '@/types/booking';

const CATEGORIES = [
  { id: 'personal_training', name: 'Personal Training', icon: '💪' },
  { id: 'yoga', name: 'Yoga', icon: '🧘' },
  { id: 'pilates', name: 'Pilates', icon: '🤸' },
  { id: 'massage', name: 'Massaggio', icon: '💆' },
  { id: 'nutrition', name: 'Nutrizione', icon: '🥗' },
  { id: 'physio', name: 'Fisioterapia', icon: '🏥' },
];

const SORT_OPTIONS = [
  { value: 'availability', label: 'Disponibilità' },
  { value: 'rating', label: 'Valutazione' },
  { value: 'price', label: 'Prezzo' },
  { value: 'distance', label: 'Distanza' },
];

export default function BookingPage() {
  const router = useRouter();
  const {
    searchResults,
    isSearching,
    searchFilters,
    searchProviders,
    setSearchFilters,
    selectProvider,
  } = useBookingStore();

  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState(searchFilters.query || '');

  const runSearch = useCallback(() => {
    return searchProviders({ ...searchFilters, query: searchQuery });
  }, [searchProviders, searchFilters, searchQuery]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      void runSearch();
    }, 300);

    return () => clearTimeout(timer);
  }, [runSearch]);

  const handleProviderSelect = useCallback((provider: ProviderSearchResult) => {
    selectProvider(provider);
    router.push(`/booking/${provider.id}`);
  }, [selectProvider, router]);

  const handleSortChange = (sortBy: SearchParams['sortBy']) => {
    setSearchFilters({ sortBy });
  };

  return (
    <div className="min-h-screen bg-background-dark">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background-dark/95 backdrop-blur-md border-b border-white/10">
        <div className="p-4 space-y-4">
          {/* Title and view toggle */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-display font-bold text-text-inverse">
              Prenota un servizio
            </h1>
            <div className="flex items-center gap-2 bg-[#2A2D3A] rounded-lg p-1">
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  'p-2 rounded-md transition-colors',
                  viewMode === 'list'
                    ? 'bg-[var(--section-primary)] text-white'
                    : 'text-text-secondary hover:text-white'
                )}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('map')}
                className={cn(
                  'p-2 rounded-md transition-colors',
                  viewMode === 'map'
                    ? 'bg-[var(--section-primary)] text-white'
                    : 'text-text-secondary hover:text-white'
                )}
              >
                <MapIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="flex gap-2">
            <Input
              placeholder="Cerca trainer, servizi..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search className="w-5 h-5" />}
              className="flex-1"
            />
            <Button
              variant="secondary"
              size="md"
              onClick={() => setShowFilters(!showFilters)}
              className={showFilters ? 'bg-[var(--section-primary)]/20' : ''}
            >
              <Filter className="w-5 h-5" />
            </Button>
          </div>

          {/* Categories */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            <button
              onClick={() => setSearchFilters({ category: undefined })}
              className={cn(
                'flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors',
                !searchFilters.category
                  ? 'bg-[var(--section-primary)] text-white'
                  : 'bg-[#2A2D3A] text-text-secondary hover:text-white'
              )}
            >
              Tutti
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSearchFilters({ category: cat.id })}
                className={cn(
                  'flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5',
                  searchFilters.category === cat.id
                    ? 'bg-[var(--section-primary)] text-white'
                    : 'bg-[#2A2D3A] text-text-secondary hover:text-white'
                )}
              >
                <span>{cat.icon}</span>
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filters Panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-white/10"
          >
            <div className="p-4 bg-[#2A2D3A]/50 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4" />
                  Filtri
                </h3>
                <button
                  onClick={() => setShowFilters(false)}
                  className="p-1 hover:bg-white/10 rounded-full"
                >
                  <X className="w-4 h-4 text-text-secondary" />
                </button>
              </div>

              {/* Price range */}
              <div className="space-y-2">
                <label className="text-sm text-text-secondary">Fascia di prezzo</label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Min €"
                    value={searchFilters.minPrice || ''}
                    onChange={(e) =>
                      setSearchFilters({ minPrice: Number(e.target.value) || undefined })
                    }
                  />
                  <Input
                    type="number"
                    placeholder="Max €"
                    value={searchFilters.maxPrice || ''}
                    onChange={(e) =>
                      setSearchFilters({ maxPrice: Number(e.target.value) || undefined })
                    }
                  />
                </div>
              </div>

              {/* Rating */}
              <div className="space-y-2">
                <label className="text-sm text-text-secondary">Valutazione minima</label>
                <div className="flex gap-2">
                  {[4, 4.5].map((rating) => (
                    <button
                      key={rating}
                      onClick={() => setSearchFilters({ rating })}
                      className={cn(
                        'flex items-center gap-1 px-3 py-2 rounded-lg text-sm transition-colors',
                        searchFilters.rating === rating
                          ? 'bg-[var(--section-primary)] text-white'
                          : 'bg-[#2A2D3A] text-text-secondary hover:text-white'
                      )}
                    >
                      <Star className="w-4 h-4 fill-current" />
                      {rating}+
                    </button>
                  ))}
                </div>
              </div>

              {/* Availability */}
              <div className="space-y-2">
                <label className="text-sm text-text-secondary">Disponibilità</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: 'today', label: 'Oggi' },
                    { value: 'this_week', label: 'Questa settimana' },
                    { value: 'this_month', label: 'Questo mese' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() =>
                        setSearchFilters({
                          availability: searchFilters.availability === opt.value
                            ? undefined
                            : opt.value as any,
                        })
                      }
                      className={cn(
                        'px-3 py-2 rounded-lg text-sm transition-colors',
                        searchFilters.availability === opt.value
                          ? 'bg-[var(--section-primary)] text-white'
                          : 'bg-[#2A2D3A] text-text-secondary hover:text-white'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sort */}
              <div className="space-y-2">
                <label className="text-sm text-text-secondary">Ordina per</label>
                <div className="flex gap-2 flex-wrap">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleSortChange(opt.value as SearchParams['sortBy'])}
                      className={cn(
                        'px-3 py-2 rounded-lg text-sm transition-colors',
                        searchFilters.sortBy === opt.value
                          ? 'bg-[var(--section-primary)] text-white'
                          : 'bg-[#2A2D3A] text-text-secondary hover:text-white'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="p-4">
        {isSearching ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Spinner size="lg" />
            <p className="text-text-secondary mt-4">Ricerca in corso...</p>
          </div>
        ) : viewMode === 'map' ? (
          <div className="h-[calc(100vh-240px)] rounded-2xl overflow-hidden">
            <GoogleMap
              gyms={searchResults.map((p) => ({
                id: p.id,
                name: p.fullName,
                city: p.location?.address || 'Milano',
                rating: p.rating,
                reviewCount: p.reviewCount,
                lat: p.location?.lat,
                lng: p.location?.lng,
                isPartner: p.isVerified,
              }))}
              onGymSelect={(id) => {
                const provider = searchResults.find((p) => p.id === id);
                if (provider) handleProviderSelect(provider);
              }}
              className="h-full"
            />
          </div>
        ) : (
          <div className="space-y-4">
            {searchResults.length === 0 ? (
              <div className="text-center py-12">
                <Search className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">
                  Nessun risultato trovato
                </h3>
                <p className="text-text-secondary">
                  Prova a modificare i filtri di ricerca
                </p>
              </div>
            ) : (
              searchResults.map((provider) => (
                <motion.div
                  key={provider.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => handleProviderSelect(provider)}
                  className="bg-[#2A2D3A]/50 rounded-2xl p-4 cursor-pointer hover:bg-[#2A2D3A] transition-colors"
                >
                  <div className="flex gap-4">
                    <Avatar
                      src={provider.avatarUrl}
                      alt={provider.fullName}
                      size="xl"
                      className="flex-shrink-0"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-white truncate">
                            {provider.fullName}
                          </h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="flex items-center gap-1">
                              <Star className="w-3.5 h-3.5 text-warning fill-warning" />
                              <span className="text-sm text-white">
                                {provider.rating.toFixed(1)}
                              </span>
                            </div>
                            <span className="text-text-tertiary text-sm">
                              ({provider.reviewCount} recensioni)
                            </span>
                          </div>
                        </div>
                        {provider.isVerified && (
                          <Badge variant="partner" size="sm">Verificato</Badge>
                        )}
                      </div>

                      {/* Specialties */}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {provider.specialties.slice(0, 3).map((specialty) => (
                          <span
                            key={specialty}
                            className="text-xs bg-white/10 text-text-secondary px-2 py-0.5 rounded-full"
                          >
                            {specialty}
                          </span>
                        ))}
                        {provider.specialties.length > 3 && (
                          <span className="text-xs text-text-tertiary">
                            +{provider.specialties.length - 3}
                          </span>
                        )}
                      </div>

                      {/* Languages & Experience */}
                      <div className="flex items-center gap-3 mt-2 text-xs text-text-tertiary">
                        <span>{provider.yearsOfExperience} anni exp.</span>
                        {provider.languages.length > 0 && (
                          <span>{provider.languages.join(', ')}</span>
                        )}
                      </div>

                      {/* Price & Availability */}
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
                        <div>
                          <span className="text-lg font-bold text-[var(--section-primary)]">
                            Da {formatPrice(Math.min(...provider.services.map((s) => s.price)))}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-text-secondary">
                          <Clock className="w-4 h-4" />
                          {provider.nextAvailable ? (
                            <span>Disponibile dal {provider.nextAvailable.toLocaleDateString('it-IT')}</span>
                          ) : (
                            <span>Controlla disponibilità</span>
                          )}
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

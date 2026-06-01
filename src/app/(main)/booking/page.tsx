'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { useNearMe } from '@/hooks/useNearMe';
import { RadiusFilter } from '@/components/map/RadiusFilter';
import { annotateAndSortByDistance, filterByRadius } from '@/lib/geo';
import { useServiceCategories } from '@/hooks/useServiceCategories';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';

export default function BookingPage() {
  const { t, locale } = useI18n();
  const serviceCategories = useServiceCategories();
  const router = useRouter();
  const {
    searchResults,
    isSearching,
    searchFilters,
    searchProviders,
    setSearchFilters,
    selectProvider,
  } = useBookingStore();

  const { userLocation, radiusKm, isLocating, error, requestLocation, clearLocation, setRadiusKm } = useNearMe();

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
    router.push(`/book?providerId=${provider.id}`);
  }, [selectProvider, router]);

  const handleSortChange = (sortBy: SearchParams['sortBy']) => {
    setSearchFilters({ sortBy });
  };

  const displayedProviders = useMemo(() => {
    if (!userLocation) return searchResults;
    const annotated = annotateAndSortByDistance(searchResults, userLocation, (p) =>
      p.location ? { lat: p.location.lat, lng: p.location.lng } : null
    );
    return radiusKm == null ? annotated : filterByRadius(annotated, radiusKm);
  }, [searchResults, userLocation, radiusKm]);

  return (
    <div className="min-h-screen bg-background-dark">
      {/* Search/filter sub-header — non-sticky so it sits below the app header (MainLayout) */}
      <div className="border-b border-hairline bg-background-dark/95 backdrop-blur-md">
        <div className="p-4 space-y-4">
          {/* Title and view toggle */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-display font-bold text-text-inverse">
              {t('booking.page.title')}
            </h1>
            <div className="flex items-center gap-2 bg-surface-elevated rounded-lg p-1">
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  'p-2 rounded-md transition-colors',
                  viewMode === 'list'
                    ? 'bg-[var(--section-primary)] text-white'
                    : 'text-text-secondary hover:text-content'
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
                    : 'text-text-secondary hover:text-content'
                )}
              >
                <MapIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="flex gap-2">
            <Input
              placeholder={t('booking.search.placeholder')}
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
                  : 'bg-surface-elevated text-text-secondary hover:text-content'
              )}
            >
              {t('booking.category.all')}
            </button>
            {serviceCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSearchFilters({ category: cat.name })}
                className={cn(
                  'flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5',
                  searchFilters.category === cat.name
                    ? 'bg-[var(--section-primary)] text-white'
                    : 'bg-surface-elevated text-text-secondary hover:text-content'
                )}
              >
                <span>{cat.icon}</span>
                {cat.name}
              </button>
            ))}
          </div>
        </div>
        <div className="px-4 pb-3">
          <RadiusFilter
            userLocation={userLocation}
            radiusKm={radiusKm}
            isLocating={isLocating}
            error={error}
            onRequestLocation={requestLocation}
            onClearLocation={clearLocation}
            onRadiusChange={setRadiusKm}
          />
        </div>
      </div>

      {/* Filters Panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-hairline"
          >
            <div className="p-4 bg-surface-elevated/50 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-content flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4" />
                  {t('booking.filters.title')}
                </h3>
                <button
                  onClick={() => setShowFilters(false)}
                  className="p-1 hover:bg-surface-2 rounded-full"
                >
                  <X className="w-4 h-4 text-text-secondary" />
                </button>
              </div>

              {/* Price range */}
              <div className="space-y-2">
                <label className="text-sm text-text-secondary">{t('booking.filters.priceRange')}</label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder={t('booking.filters.minPrice')}
                    value={searchFilters.minPrice || ''}
                    onChange={(e) =>
                      setSearchFilters({ minPrice: Number(e.target.value) || undefined })
                    }
                  />
                  <Input
                    type="number"
                    placeholder={t('booking.filters.maxPrice')}
                    value={searchFilters.maxPrice || ''}
                    onChange={(e) =>
                      setSearchFilters({ maxPrice: Number(e.target.value) || undefined })
                    }
                  />
                </div>
              </div>

              {/* Rating */}
              <div className="space-y-2">
                <label className="text-sm text-text-secondary">{t('booking.filters.minRating')}</label>
                <div className="flex gap-2">
                  {[4, 4.5].map((rating) => (
                    <button
                      key={rating}
                      onClick={() => setSearchFilters({ rating })}
                      className={cn(
                        'flex items-center gap-1 px-3 py-2 rounded-lg text-sm transition-colors',
                        searchFilters.rating === rating
                          ? 'bg-[var(--section-primary)] text-white'
                          : 'bg-surface-elevated text-text-secondary hover:text-content'
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
                <label className="text-sm text-text-secondary">{t('booking.filters.availability')}</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: 'today', label: t('booking.availability.today') },
                    { value: 'this_week', label: t('booking.availability.thisWeek') },
                    { value: 'this_month', label: t('booking.availability.thisMonth') },
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
                          : 'bg-surface-elevated text-text-secondary hover:text-content'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sort */}
              <div className="space-y-2">
                <label className="text-sm text-text-secondary">{t('booking.filters.sortBy')}</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: 'availability', label: t('booking.sort.availability') },
                    { value: 'rating', label: t('booking.sort.rating') },
                    { value: 'price', label: t('booking.sort.price') },
                    { value: 'distance', label: t('booking.sort.distance') },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleSortChange(opt.value as SearchParams['sortBy'])}
                      className={cn(
                        'px-3 py-2 rounded-lg text-sm transition-colors',
                        searchFilters.sortBy === opt.value
                          ? 'bg-[var(--section-primary)] text-white'
                          : 'bg-surface-elevated text-text-secondary hover:text-content'
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
            <p className="text-text-secondary mt-4">{t('booking.searching')}</p>
          </div>
        ) : viewMode === 'map' ? (
          <div className="h-[calc(100vh-240px)] rounded-2xl overflow-hidden">
            <GoogleMap
              gyms={displayedProviders.map((p) => ({
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
                const provider = displayedProviders.find((p) => p.id === id);
                if (provider) handleProviderSelect(provider);
              }}
              className="h-full"
            />
          </div>
        ) : (
          <div className="space-y-4">
            {displayedProviders.length === 0 ? (
              <div className="text-center py-12">
                <Search className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
                <h3 className="text-lg font-medium text-content mb-2">
                  {t('booking.noResults.title')}
                </h3>
                <p className="text-text-secondary">
                  {t('booking.noResults.subtitle')}
                </p>
              </div>
            ) : (
              displayedProviders.map((provider) => (
                <motion.div
                  key={provider.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => handleProviderSelect(provider)}
                  className="bg-surface-elevated/50 rounded-2xl overflow-hidden cursor-pointer hover:bg-surface-elevated transition-colors"
                >
                  {provider.photoUrls && provider.photoUrls[0] && (
                    <div className="h-28 overflow-hidden rounded-t-2xl">
                      <img
                        src={provider.photoUrls[0]}
                        alt={provider.fullName}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex gap-4 p-4">
                    <Avatar
                      src={provider.avatarUrl}
                      alt={provider.fullName}
                      size="xl"
                      className="flex-shrink-0"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-content truncate">
                            {provider.fullName}
                          </h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="flex items-center gap-1">
                              <Star className="w-3.5 h-3.5 text-warning fill-warning" />
                              <span className="text-sm text-content">
                                {provider.rating.toFixed(1)}
                              </span>
                            </div>
                            <span className="text-text-tertiary text-sm">
                              {t('booking.provider.reviews', { count: provider.reviewCount })}
                            </span>
                          </div>
                        </div>
                        {provider.isVerified && (
                          <Badge variant="partner" size="sm">{t('booking.provider.verified')}</Badge>
                        )}
                      </div>

                      {/* Specialties */}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {provider.specialties.slice(0, 3).map((specialty) => (
                          <span
                            key={specialty}
                            className="text-xs bg-surface-2 text-text-secondary px-2 py-0.5 rounded-full"
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
                        <span>{t('booking.provider.yearsExp', { count: provider.yearsOfExperience })}</span>
                        {provider.languages.length > 0 && (
                          <span>{provider.languages.join(', ')}</span>
                        )}
                      </div>

                      {/* Price & Availability */}
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-hairline">
                        <div>
                          {provider.lowestPrice != null ? (
                            <span className="text-lg font-bold text-[var(--section-primary)]">
                              {t('booking.price.from', { price: formatPrice(provider.lowestPrice) })}
                            </span>
                          ) : (
                            <span className="text-sm text-text-secondary">{t('booking.provider.viewAvailability')}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-text-secondary">
                          {Number.isFinite((provider as unknown as { distanceKm?: number }).distanceKm) && (
                            <span className="text-xs text-text-tertiary">
                              {(provider as unknown as { distanceKm: number }).distanceKm.toFixed(1)} km
                            </span>
                          )}
                          <Clock className="w-4 h-4" />
                          {provider.nextAvailable ? (
                            <span>{t('booking.provider.availableFrom', { date: provider.nextAvailable.toLocaleDateString(toLocaleTag(locale)) })}</span>
                          ) : (
                            <span>{t('booking.provider.checkAvailability')}</span>
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

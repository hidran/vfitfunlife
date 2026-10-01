'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
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
import { cn, formatDecimal, formatDistance, formatPrice } from '@/lib/utils';
import { useBookingStore } from '@/stores/bookingStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { MapPlaceholder } from '@/components/map/MapPlaceholder';
import type { ProviderSearchResult, SearchParams } from '@/types/booking';
import { useNearMe } from '@/hooks/useNearMe';
import { RadiusFilter } from '@/components/map/RadiusFilter';
import { useQuery } from '@tanstack/react-query';
import { annotateAndSortByDistance, roundLocation, type LatLng } from '@/lib/geo';
import { applyProviderSearchFilters, searchProvidersNear } from '@/lib/firebookings';
import { useServiceCategoryGroups } from '@/hooks/useServiceCategories';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';

// Map view is a toggle away from the default list view, so GoogleMap (and its
// @googlemaps/js-api-loader dependency) shouldn't sit in this route's initial JS.
const GoogleMap = dynamic(() => import('@/components/map/GoogleMap').then((mod) => mod.GoogleMap), {
  ssr: false,
  loading: () => <MapPlaceholder className="h-full" />,
});

export default function BookingPage() {
  const { t, locale } = useI18n();
  // Groups, not the full catalogue: 29 chips is an unusable row, 8 is a browse bar. A
  // group chip still matches every provider beneath it, because categoryIds carries the
  // leaf AND its ancestors.
  const categoryGroups = useServiceCategoryGroups();
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

  // Located with a radius: a bounded geohash search around the user, not a distance filter
  // over the store's first-50-by-id page (which may hold nobody nearby). Radius "Tutti" and
  // no location keep the store's bounded list. Only the category reaches Firestore; text,
  // price and rating filter the fetched page in memory, so typing costs no reads.
  const nearCenter = userLocation ? roundLocation(userLocation) : null;
  const geoSearch = nearCenter != null && radiusKm != null;
  const nearCategory = searchFilters.category;
  const nearQuery = useQuery({
    queryKey: ['providers-near', nearCategory ?? null, nearCenter, radiusKm],
    queryFn: () =>
      searchProvidersNear({ category: nearCategory }, nearCenter as LatLng, radiusKm as number),
    enabled: geoSearch,
    staleTime: 60 * 1000,
  });

  const displayedProviders = useMemo<(ProviderSearchResult & { distanceKm?: number })[]>(() => {
    if (geoSearch) {
      return applyProviderSearchFilters(nearQuery.data ?? [], {
        ...searchFilters,
        query: searchQuery,
        sortBy: undefined, // distance order, as the near-me list always had
      });
    }
    if (!userLocation) return searchResults;
    return annotateAndSortByDistance(searchResults, userLocation, (p) =>
      p.location ? { lat: p.location.lat, lng: p.location.lng } : null
    );
  }, [geoSearch, nearQuery.data, searchFilters, searchQuery, searchResults, userLocation]);
  const isLoadingProviders = geoSearch ? nearQuery.isLoading : isSearching;

  const runSearch = useCallback(() => {
    return searchProviders({ ...searchFilters, query: searchQuery });
  }, [searchProviders, searchFilters, searchQuery]);

  // Debounced search. Skipped while the radius search drives the list: its page would be
  // thrown away. Flipping geoSearch back re-runs it with the current filters.
  useEffect(() => {
    if (geoSearch) return;
    const timer = setTimeout(() => {
      void runSearch();
    }, 300);

    return () => clearTimeout(timer);
  }, [runSearch, geoSearch]);

  const handleProviderSelect = useCallback((provider: ProviderSearchResult) => {
    selectProvider(provider);
    router.push(`/book?providerId=${provider.id}`);
  }, [selectProvider, router]);

  const handleSortChange = (sortBy: SearchParams['sortBy']) => {
    setSearchFilters({ sortBy });
  };

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
                type="button"
                aria-label={t('booking.page.viewList')}
                aria-pressed={viewMode === 'list'}
                onClick={() => setViewMode('list')}
                className={cn(
                  'p-2 rounded-md transition-colors',
                  viewMode === 'list'
                    ? 'bg-[var(--section-primary)] text-white'
                    : 'text-text-secondary hover:text-content'
                )}
              >
                <List className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={t('booking.page.viewMap')}
                aria-pressed={viewMode === 'map'}
                onClick={() => setViewMode('map')}
                className={cn(
                  'p-2 rounded-md transition-colors',
                  viewMode === 'map'
                    ? 'bg-[var(--section-primary)] text-white'
                    : 'text-text-secondary hover:text-content'
                )}
              >
                <MapIcon className="w-4 h-4" aria-hidden="true" />
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
            {categoryGroups.map(({ group: cat }) => (
              <button
                key={cat.id}
                // The id, not the name: categoryIds carries ancestry, so selecting a
                // group matches its whole subtree, and renaming a category in
                // /admin/services no longer changes who is findable.
                onClick={() => setSearchFilters({ category: cat.id })}
                className={cn(
                  'flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5',
                  searchFilters.category === cat.id
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
        {isLoadingProviders ? (
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
                href: `/book?providerId=${p.id}`,
              }))}
              linkLabel={t('booking.provider.checkAvailability')}
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
                >
                  {/* A real link, so Tab + Enter (and open-in-new-tab) reach the trainer */}
                  <Link
                    href={`/book?providerId=${provider.id}`}
                    onClick={() => selectProvider(provider)}
                    className="block bg-surface-elevated/50 rounded-2xl overflow-hidden hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-section-primary"
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
                        {/* The badge drops under the name when both don't fit, instead of being clipped */}
                        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                          <div className="min-w-[7rem] flex-1">
                            <h3 className="font-semibold text-content truncate">
                              {provider.fullName}
                            </h3>
                            <div className="flex items-center gap-2 mt-0.5">
                              <div className="flex items-center gap-1">
                                <Star className="w-3.5 h-3.5 text-warning fill-warning" />
                                <span className="text-sm text-content">
                                  {formatDecimal(provider.rating, locale, 1)}
                                </span>
                              </div>
                              <span className="text-text-tertiary text-sm">
                                {t('booking.provider.reviews', { count: provider.reviewCount })}
                              </span>
                            </div>
                          </div>
                          {provider.isVerified && (
                            <Badge variant="partner" size="sm" className="shrink-0">{t('booking.provider.verified')}</Badge>
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
                        {/* Distance sits with the price; on narrow cards the availability link wraps
                            to its own line as a unit instead of breaking between the two. */}
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mt-3 pt-3 border-t border-hairline">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            {provider.lowestPrice != null ? (
                              <span className="text-lg font-bold text-[var(--section-primary)] whitespace-nowrap">
                                {t('booking.price.from', { price: formatPrice(provider.lowestPrice, locale) })}
                              </span>
                            ) : (
                              <span className="text-sm text-text-secondary">{t('booking.provider.viewAvailability')}</span>
                            )}
                            {provider.distanceKm != null && Number.isFinite(provider.distanceKm) && (
                              <span className="text-xs text-text-tertiary whitespace-nowrap">
                                {formatDistance(provider.distanceKm, locale)}
                              </span>
                            )}
                          </div>
                          <div className="ml-auto flex items-center gap-2 text-sm text-text-secondary">
                            <Clock className="w-4 h-4 shrink-0" />
                            {provider.nextAvailable ? (
                              <span>{t('booking.provider.availableFrom', { date: provider.nextAvailable.toLocaleDateString(toLocaleTag(locale)) })}</span>
                            ) : (
                              <span>{t('booking.provider.checkAvailability')}</span>
                            )}
                            <ChevronRight className="w-4 h-4 shrink-0" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

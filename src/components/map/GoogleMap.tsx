'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { cn, formatDecimal } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/contexts/ThemeContext';
import { mapStylesFor } from './mapStyles';
import { markerInfoContent } from './markerInfoContent';

interface Gym {
  id: string;
  name: string;
  city: string;
  rating: number;
  reviewCount: number;
  lat?: number;
  lng?: number;
  isPartner?: boolean;
  /** Where the pop-up's link goes (trainer / venue page). No href, no link. */
  href?: string;
}

interface GoogleMapProps {
  gyms: Gym[];
  userLocation?: { lat: number; lng: number };
  /** Plain clicks on a pop-up link go through this (in-app navigation) instead of a page load. */
  onGymSelect?: (gymId: string) => void;
  /** Label of the pop-up link; defaults to "View details". */
  linkLabel?: string;
  className?: string;
}

interface MarkerEntry {
  marker: google.maps.Marker;
  /** Latest data for this id: the pop-up is built from it when the marker is clicked. */
  gym: Gym;
  iconKey: string;
}

const markerIcon = (rating: string, isPartner?: boolean): google.maps.Icon => ({
  url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r="16" fill="${isPartner ? '#00C9FF' : '#7B61FF'}" stroke="white" stroke-width="2"/>
      <text x="18" y="22" text-anchor="middle" fill="white" font-size="12" font-weight="bold">${rating}</text>
    </svg>
  `)}`,
  scaledSize: new google.maps.Size(36, 36),
  anchor: new google.maps.Point(18, 18),
});

/** A click the browser should handle itself (new tab/window, download, middle button). */
const isModifiedClick = (e: MouseEvent) =>
  e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;

export function GoogleMap({ gyms, userLocation, onGymSelect, linkLabel, className }: GoogleMapProps) {
  const { t, locale } = useI18n();
  const { theme } = useTheme();
  // Latest theme for the map's creation; later switches go through setOptions below.
  const themeRef = useRef(theme);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  const hasPlaceholderKey = !apiKey || /your_|example|xxx/i.test(apiKey);
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  // The map is created asynchronously (and again when userLocation changes), so the marker
  // effect keys on this state rather than on the ref.
  const [map, setMapInstance] = useState<google.maps.Map | null>(null);
  // Markers by gym id: re-renders update them in place instead of redrawing them, so an open
  // pop-up survives a parent re-render (/booking rebuilds `gyms` on every render).
  const markersRef = useRef(new Map<string, MarkerEntry>());
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  // One InfoWindow for the whole map: opening a marker's pop-up closes the previous one.
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const openPopupRef = useRef<{ id: string; contentKey: string } | null>(null);
  const fittedIdsRef = useRef<string | null>(null);
  const popupContentRef = useRef<(gym: Gym) => HTMLElement>(() => document.createElement('div'));
  // Callers pass inline closures; read the latest one at click time.
  const onGymSelectRef = useRef(onGymSelect);
  useEffect(() => {
    onGymSelectRef.current = onGymSelect;
  });
  const [isLoading, setIsLoading] = useState(Boolean(apiKey) && !hasPlaceholderKey);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const error = runtimeError ?? (hasPlaceholderKey ? t('map.google.error.apiKeyInvalid') : null);

  // Initialize map
  useEffect(() => {
    if (!apiKey || hasPlaceholderKey) {
      return;
    }

    let cancelled = false;
    const loader = new Loader({
      apiKey,
      version: 'weekly',
      libraries: ['places'],
    });

    loader.load().then(() => {
      if (cancelled || !mapRef.current) return;

      // Default to Milan if no user location
      const center = userLocation || { lat: 45.4642, lng: 9.1900 };

      const mapOptions: google.maps.MapOptions = {
        center,
        zoom: 13,
        mapTypeId: 'roadmap',
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControl: true,
        styles: mapStylesFor(themeRef.current, { hidePoiLabels: true }),
      };

      googleMapRef.current = new google.maps.Map(mapRef.current, mapOptions);
      setMapInstance(googleMapRef.current);
      setRuntimeError(null);
      setIsLoading(false);
    }).catch((err: unknown) => {
      if (cancelled) return;
      const message =
        typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message?: string }).message ?? '')
          : '';
      const lowerMessage = message.toLowerCase();
      const isDomainOrBillingError =
        /referer|origin|notallowedmaperror|billing|forbidden|api key|denied|unauthorized/i.test(
          lowerMessage
        );

      console.error('Google Maps loading error:', err);
      setRuntimeError(
        isDomainOrBillingError
          ? t('map.google.error.requestRejected')
          : t('map.google.error.loadFailed')
      );
      setIsLoading(false);
    });

    const markers = markersRef.current;
    return () => {
      cancelled = true;
      // Everything below belongs to this map instance; the next one starts from scratch.
      markers.forEach(({ marker }) => {
        google.maps.event.clearInstanceListeners(marker);
        marker.setMap(null);
      });
      markers.clear();
      userMarkerRef.current?.setMap(null);
      userMarkerRef.current = null;
      infoWindowRef.current?.close();
      infoWindowRef.current = null;
      openPopupRef.current = null;
      fittedIdsRef.current = null;
      googleMapRef.current = null;
      setMapInstance(null);
    };
  }, [apiKey, hasPlaceholderKey, t, userLocation]);

  // Follow the resolved theme live (the map is created once per location, not per theme).
  useEffect(() => {
    themeRef.current = theme;
    if (isLoading) return;
    googleMapRef.current?.setOptions({ styles: mapStylesFor(theme, { hidePoiLabels: true }) });
  }, [theme, isLoading]);

  // Sync markers with `gyms` by id: add new ones, update changed ones, remove gone ones.
  // A marker click only opens its pop-up; the pop-up's link is what navigates.
  useEffect(() => {
    if (!map) return;

    const label = linkLabel ?? t('map.google.viewDetails');
    const contentKeyOf = (gym: Gym) =>
      JSON.stringify([gym.name, gym.city, gym.rating, gym.reviewCount, gym.isPartner, gym.href, locale, label]);
    const popupContent = (gym: Gym) =>
      markerInfoContent({
        name: gym.name,
        city: gym.city,
        rating: formatDecimal(gym.rating, locale, 1),
        reviewsLabel: t('map.google.reviews', { count: gym.reviewCount }),
        partnerLabel: gym.isPartner ? t('map.google.partner') : undefined,
        link: gym.href
          ? {
              href: gym.href,
              label,
              onClick: (e) => {
                const select = onGymSelectRef.current;
                if (!select || e.defaultPrevented || isModifiedClick(e)) return;
                e.preventDefault();
                select(gym.id);
              },
            }
          : undefined,
      });
    popupContentRef.current = popupContent;

    let infoWindow = infoWindowRef.current;
    if (!infoWindow) {
      infoWindow = new google.maps.InfoWindow();
      infoWindow.addListener('closeclick', () => {
        openPopupRef.current = null;
      });
      infoWindowRef.current = infoWindow;
    }

    const entries = markersRef.current;
    const seen = new Set<string>();
    const bounds = new google.maps.LatLngBounds();

    gyms.forEach((gym) => {
      if (typeof gym.lat !== 'number' || typeof gym.lng !== 'number') return;
      seen.add(gym.id);
      const position = { lat: gym.lat, lng: gym.lng };
      bounds.extend(position);
      const rating = formatDecimal(gym.rating, locale, 1);
      const iconKey = `${rating}|${gym.isPartner ? 1 : 0}`;

      const existing = entries.get(gym.id);
      if (existing) {
        existing.gym = gym;
        const current = existing.marker.getPosition();
        if (!current || current.lat() !== gym.lat || current.lng() !== gym.lng) {
          existing.marker.setPosition(position);
        }
        if (existing.marker.getTitle() !== gym.name) existing.marker.setTitle(gym.name);
        if (existing.iconKey !== iconKey) {
          existing.marker.setIcon(markerIcon(rating, gym.isPartner));
          existing.iconKey = iconKey;
        }
        return;
      }

      const marker = new google.maps.Marker({
        position,
        map,
        title: gym.name,
        icon: markerIcon(rating, gym.isPartner),
      });
      const entry: MarkerEntry = { marker, gym, iconKey };
      marker.addListener('click', () => {
        const popup = infoWindowRef.current;
        if (!popup) return;
        openPopupRef.current = { id: gym.id, contentKey: contentKeyOf(entry.gym) };
        popup.setContent(popupContentRef.current(entry.gym));
        popup.open({ map, anchor: marker });
      });
      entries.set(gym.id, entry);
    });

    entries.forEach((entry, id) => {
      if (seen.has(id)) return;
      google.maps.event.clearInstanceListeners(entry.marker);
      entry.marker.setMap(null);
      entries.delete(id);
    });

    // Keep the open pop-up in step with its data (or close it if its marker is gone); only
    // rebuild it when something it shows changed, so focus inside it isn't lost on re-render.
    const open = openPopupRef.current;
    if (open) {
      const entry = entries.get(open.id);
      if (!entry) {
        infoWindow.close();
        openPopupRef.current = null;
      } else if (contentKeyOf(entry.gym) !== open.contentKey) {
        open.contentKey = contentKeyOf(entry.gym);
        infoWindow.setContent(popupContent(entry.gym));
      }
    }

    if (userLocation) {
      const position = { lat: userLocation.lat, lng: userLocation.lng };
      if (userMarkerRef.current) {
        userMarkerRef.current.setPosition(position);
        userMarkerRef.current.setTitle(t('booking.map.yourPosition'));
      } else {
        userMarkerRef.current = new google.maps.Marker({
          position,
          map,
          title: t('booking.map.yourPosition'),
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#2563eb',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
          zIndex: 9999,
        });
      }
    } else if (userMarkerRef.current) {
      userMarkerRef.current.setMap(null);
      userMarkerRef.current = null;
    }

    // Fit the map to the markers only when the set of places changes, not on every re-render
    // (that would pan away from the pop-up the user just opened).
    const fittedIds = Array.from(seen).sort().join('|');
    if (seen.size > 0 && fittedIds !== fittedIdsRef.current) {
      map.fitBounds(bounds, 50);
    }
    fittedIdsRef.current = fittedIds;
  }, [map, gyms, linkLabel, locale, t, userLocation]);

  if (error) {
    return (
      <div className={cn("flex items-center justify-center bg-background-dark rounded-2xl border border-hairline", className)}>
        <div className="text-center p-6">
          <p className="text-red-400 light:text-red-600 text-sm mb-2">{error}</p>
          <p className="text-text-tertiary text-xs">{t('map.google.error.checkConfig')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative rounded-2xl overflow-hidden border border-hairline", className)}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background-dark z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-content/20 border-t-section-primary rounded-full animate-spin" />
            <p className="text-text-tertiary text-sm">{t('map.google.loading')}</p>
          </div>
        </div>
      )}
      <div 
        ref={mapRef} 
        className="w-full h-full min-h-[400px]"
        style={{ background: 'var(--color-background-dark)' }}
      />
    </div>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { MapPin, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/contexts/ThemeContext';
import { mapStylesFor } from '@/components/map/mapStyles';
import type { LatLng } from '@/lib/geo';
import { cityFromAddressComponents, isValidLatLng } from '@/lib/providerLocation';

/** Italy's rough centre, for a venue with no location yet. */
const DEFAULT_CENTER: LatLng = { lat: 42.5, lng: 12.5 };

/** Venues are public businesses, so no privacy rounding: 6 decimals is centimetre precision. */
const COORD_DECIMALS = 6;
const round = (v: number) => Math.round(v * 10 ** COORD_DECIMALS) / 10 ** COORD_DECIMALS;

function mapsApiKey(): string | null {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return key && !/your_|example|xxx/i.test(key) ? key : null;
}

interface VenueLocationPickerProps {
  /** Current pin; `null` while the venue has no coordinates. Either value may be NaN mid-typing. */
  value: { lat: number | null; lng: number | null };
  /** The address typed in the form, geocoded by "find on map". */
  addressQuery: string;
  readonly: boolean;
  /** Validation message from the form, shown inline with role=alert. */
  error?: string;
  /** A new pin, plus the city the geocoder found for it (empty when it found none). */
  onChange: (point: LatLng, geocodedCity: string) => void;
}

/**
 * Where an admin sets the position "near me" search finds a venue at: the same three ways in
 * as the provider LocationEditor (address geocoding, tapping/dragging the pin, typing the
 * coordinates), minus device geolocation (an admin is rarely standing in the venue). Without
 * a Maps key the map and the address search are hidden; the coordinate fields still work.
 */
export function VenueLocationPicker({ value, addressQuery, readonly, error, onChange }: VenueLocationPickerProps) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const apiKey = mapsApiKey();
  const point = isValidLatLng(value) ? value : null;
  const [mapsReady, setMapsReady] = useState(false);
  const [mapsFailed, setMapsFailed] = useState(!apiKey);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);

  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const readonlyRef = useRef(readonly);
  readonlyRef.current = readonly;

  /** A pin picked on the map: reverse-geocode its city, then hand both to the form. */
  const pickOnMap = useCallback(async (next: LatLng) => {
    if (readonlyRef.current) return;
    const rounded = { lat: round(next.lat), lng: round(next.lng) };
    let city = '';
    try {
      const { results } = (await geocoderRef.current?.geocode({ location: rounded })) ?? { results: [] };
      city = cityFromAddressComponents(results[0]?.address_components);
    } catch {
      // Reverse geocoding is a convenience; the admin can type the city.
    }
    onChangeRef.current(rounded, city);
  }, []);

  // Load the map once. Same Loader options as components/map/GoogleMap: the loader refuses
  // a second instantiation with different ones.
  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    new Loader({ apiKey, version: 'weekly', libraries: ['places'] })
      .load()
      .then(() => {
        if (cancelled || !mapDivRef.current) return;
        const map = new google.maps.Map(mapDivRef.current, {
          center: point ?? DEFAULT_CENTER,
          zoom: point ? 15 : 6,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          styles: mapStylesFor(theme),
        });
        const marker = new google.maps.Marker({
          map,
          position: point ?? undefined,
          visible: !!point,
          draggable: true,
          title: t('admin.venues.location.markerTitle'),
        });
        map.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (e.latLng) void pickOnMap({ lat: e.latLng.lat(), lng: e.latLng.lng() });
        });
        marker.addListener('dragend', () => {
          const pos = marker.getPosition();
          if (pos) void pickOnMap({ lat: pos.lat(), lng: pos.lng() });
        });
        mapRef.current = map;
        markerRef.current = marker;
        geocoderRef.current = new google.maps.Geocoder();
        setMapsReady(true);
      })
      .catch((err: unknown) => {
        console.error('[VenueLocationPicker] Google Maps failed to load', err);
        if (!cancelled) setMapsFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // point/t/theme only seed the first render of the map (theme switches: effect below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  useEffect(() => {
    if (mapsReady) mapRef.current?.setOptions({ styles: mapStylesFor(theme) });
  }, [mapsReady, theme]);

  useEffect(() => {
    if (mapsReady) markerRef.current?.setDraggable(!readonly);
  }, [mapsReady, readonly]);

  // Keep the pin on the form's coordinates (typed, geocoded or picked).
  const lat = point?.lat;
  const lng = point?.lng;
  useEffect(() => {
    const marker = markerRef.current;
    if (!mapsReady || !marker) return;
    if (lat === undefined || lng === undefined) {
      marker.setVisible(false);
      return;
    }
    marker.setPosition({ lat, lng });
    marker.setVisible(true);
    mapRef.current?.panTo({ lat, lng });
    if ((mapRef.current?.getZoom() ?? 0) < 13) mapRef.current?.setZoom(15);
  }, [mapsReady, lat, lng]);

  const findOnMap = async () => {
    const geocoder = geocoderRef.current;
    const address = addressQuery.trim();
    if (!geocoder || !address) return;
    setIsSearching(true);
    setSearchError(false);
    try {
      const { results } = await geocoder.geocode({ address, region: 'it' });
      const first = results[0];
      if (!first?.geometry?.location) throw new Error('not-found');
      const next = { lat: round(first.geometry.location.lat()), lng: round(first.geometry.location.lng()) };
      onChange(next, cityFromAddressComponents(first.address_components));
    } catch {
      setSearchError(true);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-3">
      {!mapsFailed && !readonly && (
        <Button
          type="button"
          variant="outline"
          onClick={findOnMap}
          isLoading={isSearching}
          disabled={!mapsReady || isSearching || !addressQuery.trim()}
          className="min-h-[44px]"
        >
          <Search className="mr-2 h-4 w-4" aria-hidden />
          {t('admin.venues.location.findOnMap')}
        </Button>
      )}

      {mapsFailed ? (
        <p className="rounded-xl border border-hairline bg-surface-2 p-4 text-sm text-content-muted">
          {t('admin.venues.location.mapUnavailable')}
        </p>
      ) : (
        <div>
          <div
            ref={mapDivRef}
            className="h-64 w-full overflow-hidden rounded-2xl border border-hairline bg-surface-2"
            role="application"
            aria-label={t('provider.location.mapLabel')}
          />
          {!readonly && <p className="mt-2 text-xs text-content-muted">{t('provider.location.mapHint')}</p>}
        </div>
      )}

      <p className="flex items-center gap-2 text-sm text-content" aria-live="polite">
        <MapPin className="h-4 w-4 flex-shrink-0" aria-hidden />
        {point
          ? t('provider.location.selected', { lat: point.lat.toFixed(5), lng: point.lng.toFixed(5) })
          : t('provider.location.none')}
      </p>

      {searchError && (
        <p role="alert" className="text-sm text-error">
          {t('admin.venues.location.notFound')}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}

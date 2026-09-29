'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { Crosshair, MapPin, Save, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/hooks/useI18n';
import type { MessageKey } from '@/i18n/messages';
import type { LatLng } from '@/lib/geo';
import { getDevicePosition } from '@/lib/deviceLocation';
import { cityFromAddressComponents, isValidLatLng, type MyLocation } from '@/lib/providerLocation';

/** Italy's rough centre, for a provider with no location yet. */
const DEFAULT_CENTER: LatLng = { lat: 42.5, lng: 12.5 };

function mapsApiKey(): string | null {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return key && !/your_|example|xxx/i.test(key) ? key : null;
}

interface LocationEditorProps {
  initial: MyLocation;
  onSave: (input: { lat: number; lng: number; city: string }) => Promise<void>;
}

/**
 * Where a provider sets the position "near me" search finds them at. Three ways in, all
 * ending in the same pin: "use my current location" (Capacitor/browser geolocation), an
 * address search (Google geocoder) and tapping/dragging on the map. The city is filled from
 * the geocoder when it can be and stays editable. Without a Maps key the map and the address
 * search are hidden; current location plus the city field still work.
 */
export function LocationEditor({ initial, onSave }: LocationEditorProps) {
  const { t } = useI18n();
  const apiKey = mapsApiKey();
  const [point, setPoint] = useState<LatLng | null>(initial.coords);
  const [city, setCity] = useState(initial.city);
  const [address, setAddress] = useState('');
  const [mapsReady, setMapsReady] = useState(false);
  const [mapsFailed, setMapsFailed] = useState(!apiKey);
  const [isLocating, setIsLocating] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [saved, setSaved] = useState(false);

  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);

  const pick = useCallback((next: LatLng) => {
    setPoint(next);
    setSaved(false);
    setError(null);
  }, []);

  /** Fill the city from the geocoder, when there is one; failures leave the field as is. */
  const fillCityFor = useCallback(async (at: LatLng) => {
    const geocoder = geocoderRef.current;
    if (!geocoder) return;
    try {
      const { results } = await geocoder.geocode({ location: at });
      const found = cityFromAddressComponents(results[0]?.address_components);
      if (found) setCity(found);
    } catch {
      // Reverse geocoding is a convenience; the provider can type the city.
    }
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
        const center = initial.coords ?? DEFAULT_CENTER;
        const map = new google.maps.Map(mapDivRef.current, {
          center,
          zoom: initial.coords ? 14 : 6,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        const marker = new google.maps.Marker({
          map,
          position: initial.coords ?? undefined,
          visible: !!initial.coords,
          draggable: true,
          title: t('provider.location.markerTitle'),
        });
        map.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          const next = { lat: e.latLng.lat(), lng: e.latLng.lng() };
          pick(next);
          void fillCityFor(next);
        });
        marker.addListener('dragend', () => {
          const pos = marker.getPosition();
          if (!pos) return;
          const next = { lat: pos.lat(), lng: pos.lng() };
          pick(next);
          void fillCityFor(next);
        });
        mapRef.current = map;
        markerRef.current = marker;
        geocoderRef.current = new google.maps.Geocoder();
        setMapsReady(true);
      })
      .catch((err: unknown) => {
        console.error('[LocationEditor] Google Maps failed to load', err);
        if (!cancelled) setMapsFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // initial/t only seed the first render of the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // Keep the pin on the picked point.
  useEffect(() => {
    const marker = markerRef.current;
    if (!mapsReady || !marker || !point) return;
    marker.setPosition(point);
    marker.setVisible(true);
    mapRef.current?.panTo(point);
    if ((mapRef.current?.getZoom() ?? 0) < 13) mapRef.current?.setZoom(14);
  }, [mapsReady, point]);

  const handleUseCurrentLocation = async () => {
    setIsLocating(true);
    setError(null);
    try {
      const here = await getDevicePosition();
      pick(here);
      await fillCityFor(here);
    } catch {
      setError('provider.location.error.geolocation');
    } finally {
      setIsLocating(false);
    }
  };

  const searchAddress = async (e: FormEvent) => {
    e.preventDefault();
    const geocoder = geocoderRef.current;
    if (!geocoder || !address.trim()) return;
    setIsSearching(true);
    setError(null);
    try {
      const { results } = await geocoder.geocode({ address: address.trim(), region: 'it' });
      const first = results[0];
      if (!first?.geometry?.location) throw new Error('not-found');
      pick({ lat: first.geometry.location.lat(), lng: first.geometry.location.lng() });
      const found = cityFromAddressComponents(first.address_components);
      if (found) setCity(found);
    } catch {
      setError('provider.location.error.notFound');
    } finally {
      setIsSearching(false);
    }
  };

  const save = async () => {
    if (!isValidLatLng(point)) {
      setError('provider.location.error.noPoint');
      return;
    }
    if (!city.trim()) {
      setError('provider.location.error.cityRequired');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onSave({ lat: point.lat, lng: point.lng, city });
      setSaved(true);
    } catch (err) {
      console.error('[LocationEditor] save failed', err);
      setError('provider.location.error.save');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <Button
        type="button"
        variant="secondary"
        fullWidth
        onClick={handleUseCurrentLocation}
        isLoading={isLocating}
        disabled={isLocating}
        className="min-h-[44px]"
      >
        <Crosshair className="mr-2 h-4 w-4" aria-hidden />
        {isLocating ? t('provider.location.locating') : t('provider.location.useCurrent')}
      </Button>

      {!mapsFailed && (
        <form onSubmit={searchAddress} className="flex items-end gap-2" role="search">
          <div className="flex-1">
            <Input
              label={t('provider.location.addressLabel')}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t('provider.location.addressPlaceholder')}
              autoComplete="street-address"
              leftIcon={<Search size={18} />}
            />
          </div>
          <Button
            type="submit"
            variant="outline"
            disabled={!mapsReady || isSearching || !address.trim()}
            isLoading={isSearching}
            className="min-h-[44px]"
          >
            {t('provider.location.search')}
          </Button>
        </form>
      )}

      {mapsFailed ? (
        <p className="rounded-xl border border-hairline bg-surface-2 p-4 text-sm text-content-muted">
          {t('provider.location.mapUnavailable')}
        </p>
      ) : (
        <div>
          <div
            ref={mapDivRef}
            className="h-72 w-full overflow-hidden rounded-2xl border border-hairline bg-surface-2"
            role="application"
            aria-label={t('provider.location.mapLabel')}
          />
          <p className="mt-2 text-xs text-content-muted">{t('provider.location.mapHint')}</p>
        </div>
      )}

      <p className="flex items-center gap-2 text-sm text-content" aria-live="polite">
        <MapPin className="h-4 w-4 flex-shrink-0" aria-hidden />
        {point
          ? t('provider.location.selected', { lat: point.lat.toFixed(3), lng: point.lng.toFixed(3) })
          : t('provider.location.none')}
      </p>

      <Input
        label={t('provider.location.cityLabel')}
        value={city}
        onChange={(e) => {
          setCity(e.target.value);
          setSaved(false);
        }}
        placeholder={t('provider.location.cityPlaceholder')}
        autoComplete="address-level2"
      />

      <p className="text-xs text-content-muted">{t('provider.location.privacyHint')}</p>

      {error && (
        <p role="alert" className="text-sm text-error">
          {t(error)}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-success-DEFAULT">
          {t('provider.location.saved')}
        </p>
      )}

      <Button
        type="button"
        variant="primary"
        size="lg"
        fullWidth
        onClick={save}
        isLoading={isSaving}
        disabled={isSaving}
      >
        <Save className="mr-2 h-5 w-5" aria-hidden />
        {t('provider.location.save')}
      </Button>
    </div>
  );
}

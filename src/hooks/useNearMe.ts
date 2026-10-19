import { useCallback, useState } from 'react';
import type { LatLng } from '@/lib/geo';

export type RadiusKm = 5 | 10 | 25 | 50 | null; // null = "Tutti"

export interface UseNearMe {
  userLocation: LatLng | null;
  radiusKm: RadiusKm;
  isLocating: boolean;
  error: string | null;
  requestLocation: () => void;
  clearLocation: () => void;
  setRadiusKm: (r: RadiusKm) => void;
}

export function useNearMe(savedLocation: LatLng | null = null): UseNearMe {
  const [manualLocation, setManualLocation] = useState<LatLng | null | undefined>(undefined);
  const userLocation = manualLocation === undefined ? savedLocation : manualLocation;
  const [radiusKm, setRadiusKm] = useState<RadiusKm>(25);
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Geolocalizzazione non supportata');
      return;
    }
    setIsLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setManualLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setIsLocating(false);
      },
      (err) => {
        setError(err?.message || 'Posizione non disponibile');
        setManualLocation(null);
        setIsLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  const clearLocation = useCallback(() => {
    setManualLocation(null);
    setError(null);
  }, []);

  return { userLocation, radiusKm, isLocating, error, requestLocation, clearLocation, setRadiusKm };
}

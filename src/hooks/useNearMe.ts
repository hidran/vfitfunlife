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

export function useNearMe(): UseNearMe {
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
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
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setIsLocating(false);
      },
      (err) => {
        setError(err?.message || 'Posizione non disponibile');
        setUserLocation(null);
        setIsLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  const clearLocation = useCallback(() => {
    setUserLocation(null);
    setError(null);
  }, []);

  return { userLocation, radiusKm, isLocating, error, requestLocation, clearLocation, setRadiusKm };
}

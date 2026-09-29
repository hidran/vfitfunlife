import { Capacitor } from '@capacitor/core';
import type { LatLng } from '@/lib/geo';

const OPTIONS = { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 };

/**
 * The device's current position: @capacitor/geolocation in the native apps (asking for the
 * permission first), the browser's navigator.geolocation on the web. Rejects when the
 * permission is denied, the API is missing, or no fix arrives in time.
 */
export async function getDevicePosition(): Promise<LatLng> {
  if (Capacitor.isNativePlatform()) {
    const { Geolocation } = await import('@capacitor/geolocation');
    const status = await Geolocation.checkPermissions();
    if (status.location !== 'granted') {
      const requested = await Geolocation.requestPermissions();
      if (requested.location !== 'granted') throw new Error('permission-denied');
    }
    const pos = await Geolocation.getCurrentPosition(OPTIONS);
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('unsupported');
  }
  return new Promise<LatLng>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(err?.message || 'unavailable')),
      OPTIONS
    );
  });
}

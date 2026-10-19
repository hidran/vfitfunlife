import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from './config';
import { geohashFor, roundLocation, type LatLng } from '@/lib/geo';

export interface CustomerSearchLocation {
  coords: LatLng;
  geohash: string;
}

function isValidLatLng(value: unknown): value is LatLng {
  if (typeof value !== 'object' || value === null) return false;
  const coords = value as Record<string, unknown>;
  return typeof coords.lat === 'number' && Number.isFinite(coords.lat) && coords.lat >= -90 && coords.lat <= 90 &&
    typeof coords.lng === 'number' && Number.isFinite(coords.lng) && coords.lng >= -180 && coords.lng <= 180;
}

/** Read the signed-in customer's optional saved search location. */
export async function fetchCustomerSearchLocation(uid: string): Promise<CustomerSearchLocation | null> {
  const snapshot = await getDoc(doc(db, 'users', uid));
  if (!snapshot.exists()) return null;
  const saved: unknown = snapshot.data().searchLocation;
  if (!isValidLatLng(saved)) return null;
  const savedGeohash = (saved as LatLng & { geohash?: unknown }).geohash;
  return {
    coords: { lat: saved.lat, lng: saved.lng },
    geohash: typeof savedGeohash === 'string' ? savedGeohash : geohashFor(saved),
  };
}

/** Save a rounded (~100 m) device position only after the customer explicitly opts in. */
export async function saveCustomerSearchLocation(
  uid: string,
  location: LatLng
): Promise<CustomerSearchLocation> {
  if (!isValidLatLng(location)) throw new Error('invalid-location');
  const coords = roundLocation(location, 3);
  const geohash = geohashFor(coords);
  await updateDoc(doc(db, 'users', uid), {
    searchLocation: { ...coords, geohash },
    updatedAt: serverTimestamp(),
  });
  return { coords, geohash };
}

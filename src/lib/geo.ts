export interface LatLng {
  lat: number;
  lng: number;
}

/** Great-circle distance in kilometers (Haversine). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Annotate each item with `distanceKm` from `from` and return a NEW array
 * sorted nearest-first. Items whose `getCoords` returns null get
 * distanceKm = Infinity and sort last.
 */
export function annotateAndSortByDistance<T>(
  items: T[],
  from: LatLng,
  getCoords: (item: T) => LatLng | null
): (T & { distanceKm: number })[] {
  return items
    .map((item) => {
      const coords = getCoords(item);
      const distanceKm = coords ? haversineKm(from, coords) : Infinity;
      return { ...item, distanceKm };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/** Keep only items within `radiusKm` (drops Infinity/out-of-range). */
export function filterByRadius<T extends { distanceKm: number }>(
  items: T[],
  radiusKm: number
): T[] {
  return items.filter((i) => i.distanceKm <= radiusKm);
}

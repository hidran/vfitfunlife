import { geohashForLocation, geohashQueryBounds } from 'geofire-common';

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

// ---------------------------------------------------------------------------
// Geohash bounding-box search (P2-6)
//
// Venues and providers carry `geohash` (geofire-common, precision 10) next to their flat
// lat/lng. A radius search is then a handful of `orderBy('geohash').startAt(lo).endAt(hi)`
// range queries covering the circle's bounding box, followed by an exact Haversine filter:
// the box over-selects at the corners, it never under-selects.
// ---------------------------------------------------------------------------

/** Precision written to every `geohash` field (~1 m cells); geofire-common's default. */
export const GEOHASH_PRECISION = 10;

export function geohashFor(point: LatLng): string {
  return geohashForLocation([point.lat, point.lng], GEOHASH_PRECISION);
}

/** `[startAt, endAt]` geohash ranges whose union covers a `radiusKm` circle around `center`. */
export function geoQueryBounds(center: LatLng, radiusKm: number): [string, string][] {
  return geohashQueryBounds([center.lat, center.lng], radiusKm * 1000).map(
    ([start, end]) => [start, end] as [string, string]
  );
}

/**
 * Merge the per-range result pages of a geohash search into one list: dedupe by id
 * (adjacent ranges can overlap), drop items without coordinates or outside `radiusKm`
 * (the ranges cover a box, not a circle), annotate `distanceKm` and sort nearest-first.
 */
export function mergeGeoResults<T extends { id: string }>(
  pages: T[][],
  center: LatLng,
  radiusKm: number,
  getCoords: (item: T) => LatLng | null
): (T & { distanceKm: number })[] {
  const byId = new Map<string, T>();
  for (const page of pages) {
    for (const item of page) if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return filterByRadius(annotateAndSortByDistance([...byId.values()], center, getCoords), radiusKm);
}

/** Flat numeric lat/lng of a document, or null: the one coordinate shape readers trust. */
export function coordsOf(item: { lat?: unknown; lng?: unknown }): LatLng | null {
  return typeof item.lat === 'number' &&
    typeof item.lng === 'number' &&
    Number.isFinite(item.lat) &&
    Number.isFinite(item.lng)
    ? { lat: item.lat, lng: item.lng }
    : null;
}

/**
 * Round a location for use in a cache key, so GPS jitter of a few metres doesn't refetch.
 * 3 decimals is about 110 m, far below the smallest radius option (5 km).
 */
export function roundLocation(point: LatLng, decimals = 3): LatLng {
  const f = 10 ** decimals;
  return { lat: Math.round(point.lat * f) / f, lng: Math.round(point.lng * f) / f };
}

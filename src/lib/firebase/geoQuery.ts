import {
  collection,
  endAt,
  getDocs,
  limit as limitQuery,
  orderBy,
  query,
  startAt,
  type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from './config';
import { geoQueryBounds, mergeGeoResults, type LatLng } from '@/lib/geo';

/**
 * Per-range page size. geohashQueryBounds returns up to ~9 ranges, so one search reads at
 * most ~9 × this many documents, whatever the collection size. Ranges are geohash- not
 * distance-ordered, so a range that hits the cap may drop a nearer match than one it
 * returns; at our density (tens of venues per city) no range comes close.
 */
export const GEO_RANGE_LIMIT = 50;

export interface GeoRangeQueryOptions<T extends { id: string }> {
  collectionPath: string;
  /** Equality/array-contains filters combined with the geohash range (need a composite index). */
  filters?: QueryConstraint[];
  center: LatLng;
  radiusKm: number;
  perRangeLimit?: number;
  /** Map a document to a result, or null to drop it (e.g. inactive). */
  fromDoc: (id: string, data: DocumentData) => T | null;
  getCoords: (item: T) => LatLng | null;
}

/**
 * Radius search over a collection whose documents carry `geohash`: one bounded range query
 * per geohash cell covering the circle, run in parallel, then merged (deduped, exact
 * Haversine filter, nearest-first). Runs straight from the client, no callable round trip.
 */
export async function geoRangeQuery<T extends { id: string }>(
  opts: GeoRangeQueryOptions<T>
): Promise<(T & { distanceKm: number })[]> {
  const { collectionPath, filters = [], center, radiusKm, perRangeLimit = GEO_RANGE_LIMIT } = opts;
  const pages = await Promise.all(
    geoQueryBounds(center, radiusKm).map(async ([start, end]) => {
      const q = query(
        collection(db, collectionPath),
        ...filters,
        orderBy('geohash'),
        startAt(start),
        endAt(end),
        limitQuery(perRangeLimit)
      );
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => opts.fromDoc(d.id, d.data()))
        .filter((item): item is T => item !== null);
    })
  );
  return mergeGeoResults(pages, center, radiusKm, opts.getCoords);
}

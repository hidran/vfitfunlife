import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  limit as limitQuery,
  orderBy,
  type Query,
  type QueryConstraint,
  type CollectionReference,
} from 'firebase/firestore';
import { db } from './config';
import { geoRangeQuery } from './geoQuery';
import { coordsOf, type LatLng } from '@/lib/geo';
import type {
  Venue,
  VenueListOptions,
  VenueService,
  VenueCourse,
  VenueType,
} from '@/types/venue';

/**
 * The `type` filter for a venue query: `in` for a list of types, `==` for one. Both use the
 * same (type, rating) / (type, geohash) composite indexes, so a list needs no extra index.
 *
 * `types` takes precedence over `type`, and an empty `types` means "no type qualifies":
 * null, which callers answer with no results rather than an unfiltered read of every venue
 * (Firestore also rejects `in []`).
 */
export function typeFilter(opts: {
  type?: VenueType;
  types?: readonly VenueType[];
}): QueryConstraint[] | null {
  if (opts.types) return opts.types.length ? [where('type', 'in', [...opts.types])] : null;
  if (opts.type) return [where('type', '==', opts.type)];
  return [];
}

export async function fetchVenue(id: string): Promise<Venue | null> {
  try {
    const snap = await getDoc(doc(db, 'venues', id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<Venue, 'id'>) };
  } catch (error) {
    console.error('[fetchVenue]', id, error);
    return null;
  }
}

export async function fetchVenues(opts: VenueListOptions = {}): Promise<Venue[]> {
  try {
    const typeConstraints = typeFilter(opts);
    if (!typeConstraints) return [];
    const constraints: QueryConstraint[] = typeConstraints;
    if (opts.city) constraints.push(where('city', '==', opts.city));
    // With `type`, needs the (type, rating desc) composite index.
    if (opts.orderByRating) constraints.push(orderBy('rating', 'desc'));
    if (opts.limit) constraints.push(limitQuery(opts.limit));
    const q: Query | CollectionReference = constraints.length
      ? query(collection(db, 'venues'), ...constraints)
      : collection(db, 'venues');
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Venue, 'id'>) }));
  } catch (error) {
    console.error('[fetchVenues]', opts, error);
    return [];
  }
}

export interface NearbyVenueOptions {
  center: LatLng;
  radiusKm: number;
  type?: VenueType;
  /** See typeFilter: wins over `type`; empty matches nothing. */
  types?: readonly VenueType[];
}

/**
 * Venues within `radiusKm` of `center`, nearest-first, each with `distanceKm`. A bounded
 * geohash range search (see geoRangeQuery) instead of reading the whole collection.
 * With `type`/`types`, needs the (type, geohash) composite index.
 */
export async function fetchVenuesNear(
  opts: NearbyVenueOptions
): Promise<(Venue & { distanceKm: number })[]> {
  try {
    const filters = typeFilter(opts);
    if (!filters) return [];
    return await geoRangeQuery<Venue>({
      collectionPath: 'venues',
      filters,
      center: opts.center,
      radiusKm: opts.radiusKm,
      fromDoc: (id, data) =>
        data.isActive === false ? null : { id, ...(data as Omit<Venue, 'id'>) },
      getCoords: coordsOf,
    });
  } catch (error) {
    console.error('[fetchVenuesNear]', opts, error);
    return [];
  }
}

export async function fetchVenueServices(venueId: string): Promise<VenueService[]> {
  try {
    const snap = await getDocs(collection(db, 'venues', venueId, 'services'));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<VenueService, 'id'>) }));
  } catch (error) {
    console.error('[fetchVenueServices]', venueId, error);
    return [];
  }
}

export async function fetchVenueCourses(venueId: string): Promise<VenueCourse[]> {
  try {
    const snap = await getDocs(collection(db, 'venues', venueId, 'courses'));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<VenueCourse, 'id'>) }));
  } catch (error) {
    console.error('[fetchVenueCourses]', venueId, error);
    return [];
  }
}

export async function updateVenuePhotos(venueId: string, photoUrls: string[]): Promise<void> {
  await updateDoc(doc(db, 'venues', venueId), { photoUrls });
}

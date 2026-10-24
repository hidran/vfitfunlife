import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
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

/** Position of the last venue of a page in the (rating desc, id desc) order: the `startAfter` of the next page. */
export interface VenuePageCursor {
  rating: number;
  id: string;
}

export interface VenuePage {
  venues: Venue[];
  /** Null once the last page is read. */
  nextCursor: VenuePageCursor | null;
}

/** Venues per page of the location-less list (`useNearbyVenues` fallback, "Load more" on /fit/gyms). */
export const VENUE_PAGE_SIZE = 24;

/**
 * One page of the location-less list: highest-rated first, the document id breaking ties so the cursor is
 * unambiguous. `orderBy(documentId(), 'desc')` is explicit because a cursor needs it, and it is `desc` because
 * Firestore appends `__name__` to a composite index in the direction of its last field, so the existing
 * (type asc, rating desc) index already covers (type asc, rating desc, __name__ desc); an ascending id would
 * need a new index. Reads `pageSize + 1` to know whether a next page exists without an empty trailing page.
 */
export async function fetchTopRatedVenuesPage(opts: {
  type?: VenueType;
  types?: readonly VenueType[];
  cursor?: VenuePageCursor | null;
  pageSize?: number;
}): Promise<VenuePage> {
  const pageSize = opts.pageSize ?? VENUE_PAGE_SIZE;
  try {
    const typeConstraints = typeFilter(opts);
    if (!typeConstraints) return { venues: [], nextCursor: null };
    const constraints: QueryConstraint[] = [
      ...typeConstraints,
      orderBy('rating', 'desc'),
      orderBy(documentId(), 'desc'),
      ...(opts.cursor ? [startAfter(opts.cursor.rating, opts.cursor.id)] : []),
      limitQuery(pageSize + 1),
    ];
    const snap = await getDocs(query(collection(db, 'venues'), ...constraints));
    const docs = snap.docs.slice(0, pageSize);
    const venues = docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Venue, 'id'>) }));
    const last = venues[venues.length - 1];
    const nextCursor = snap.docs.length > pageSize && last ? { rating: last.rating ?? 0, id: last.id } : null;
    return { venues, nextCursor };
  } catch (error) {
    console.error('[fetchTopRatedVenuesPage]', opts, error);
    return { venues: [], nextCursor: null };
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

/**
 * Venues a user can run courses for: the ones they own (`ownerId`) plus the one of an active `venueStaff` link, each
 * once, deactivated venues left out. Owner and staff are the two ways the `managesVenue` rule grants access.
 */
export async function fetchManagedVenues(uid: string): Promise<Venue[]> {
  const [owned, staff] = await Promise.all([
    getDocs(query(collection(db, 'venues'), where('ownerId', '==', uid))),
    getDoc(doc(db, 'venueStaff', uid)),
  ]);
  const venues = owned.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Venue, 'id'>) }));
  const link = staff.exists() ? (staff.data() as { venueId?: string; isActive?: boolean }) : null;
  if (link?.venueId && link.isActive !== false && !venues.some((v) => v.id === link.venueId)) {
    const staffed = await fetchVenue(link.venueId);
    if (staffed) venues.push(staffed);
  }
  return venues.filter((v) => v.isActive !== false);
}

export async function updateVenuePhotos(venueId: string, photoUrls: string[]): Promise<void> {
  await updateDoc(doc(db, 'venues', venueId), { photoUrls });
}

// ─── Venue staff (admin) ──────────────────────────────────────────────────────────────────
// `venueStaff/{uid}` = { venueId, isActive }: one document per account, so an account staffs
// at most one venue. The `managesVenue` rule and functions/src/courses/authority.ts compare
// `venueStaff/{uid}.venueId` with the venue; firestore.rules lets admins write the collection,
// which is the path these helpers take.

/** A staff link with the account's name and email resolved from `users/{uid}`. */
export interface VenueStaffMember {
  uid: string;
  venueId: string;
  isActive: boolean;
  name: string;
  email: string;
  avatarUrl: string | null;
}

/** The venue an account currently staffs, or null when it staffs none. */
export async function fetchVenueStaffLink(uid: string): Promise<{ venueId: string; isActive: boolean } | null> {
  const snap = await getDoc(doc(db, 'venueStaff', uid));
  const data = snap.exists() ? (snap.data() as { venueId?: unknown; isActive?: unknown }) : null;
  if (!data || typeof data.venueId !== 'string') return null;
  return { venueId: data.venueId, isActive: data.isActive !== false };
}

/** The staff of a venue, name and email joined from `users` (a deleted account keeps its uid as name). */
export async function fetchVenueStaff(venueId: string): Promise<VenueStaffMember[]> {
  const snap = await getDocs(query(collection(db, 'venueStaff'), where('venueId', '==', venueId)));
  return Promise.all(
    snap.docs.map(async (d) => {
      const link = d.data() as { isActive?: unknown };
      let user: { fullName?: unknown; email?: unknown; avatarUrl?: unknown } = {};
      try {
        user = (await getDoc(doc(db, 'users', d.id))).data() ?? {};
      } catch {
        // The link is still listed; only the name/email are missing.
      }
      return {
        uid: d.id,
        venueId,
        isActive: link.isActive !== false,
        name: typeof user.fullName === 'string' && user.fullName ? user.fullName : d.id,
        email: typeof user.email === 'string' ? user.email : '',
        avatarUrl: typeof user.avatarUrl === 'string' ? user.avatarUrl : null,
      };
    }),
  );
}

/** Add an account to a venue's staff, or change its active flag (the document is keyed by uid). */
export async function setVenueStaff(uid: string, venueId: string, isActive: boolean): Promise<void> {
  await setDoc(doc(db, 'venueStaff', uid), { venueId, isActive, updatedAt: serverTimestamp() });
}

/** Remove an account from venue staff altogether. */
export async function removeVenueStaff(uid: string): Promise<void> {
  await deleteDoc(doc(db, 'venueStaff', uid));
}

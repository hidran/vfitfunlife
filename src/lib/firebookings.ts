import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, getFunctionsInstance } from './firebase/config';
import { isCancelled, isDelivered } from './bookingStatus';
import {
  createBooking as createBookingFn,
  cancelBooking as cancelBookingFn,
} from './firebase/functions';
import { fetchProviderSlots } from './firebase/availability';
import { geoRangeQuery } from './firebase/geoQuery';
import type { LatLng } from './geo';
import { localDateKey } from './availability/dates';
import { normalizeSearchText, SEARCH_TOKEN_MAX_LENGTH } from './admin/adminIndex';
import { readBusinessDetails, toPublicBusiness } from './publicBusiness';
import type {
  Booking,
  BookingData,
  LocationType,
  ProviderSearchResult,
  TimeSlot,
  SearchParams,
  Discount,
  BookingFilters,
} from '@/types/booking';

const BOOKINGS_COLLECTION = 'bookings';
const INSTRUCTORS_COLLECTION = 'instructors';

/**
 * The key a search-box query is looked up by in `instructors.searchTerms`: the same
 * normalization the onInstructorWriteSearchIndex trigger stores prefixes with, so any prefix
 * of a provider's name (whole or per word), specialty or category matches. "" = no text query.
 */
export function providerSearchKey(raw: string | undefined): string {
  return normalizeSearchText(raw ?? '').slice(0, SEARCH_TOKEN_MAX_LENGTH).trim();
}

// Search providers based on filters. Reads the public /instructors mirror
// (allowed under firestore.rules for unauthenticated and authenticated users).
export async function searchProviders(params: SearchParams): Promise<ProviderSearchResult[]> {
  // A text query goes to Firestore as `searchTerms array-contains <key>`. It used to fetch the
  // first 50 providers by doc id and filter the text in memory, so a provider whose id sorted
  // after those 50 — every new signup, among 400+ — could not be found by their own name.
  //
  // Without text, a category is pushed into the query instead, so limit(50) doesn't burn
  // through unrelated docs. params.category is a TAXONOMY ID; categoryIds holds the leaf and
  // its ancestors, so one array-contains matches a group or a leaf. Firestore allows one
  // array-contains per query, so with both, the category is applied in memory below.
  const key = providerSearchKey(params.query);
  const constraints: QueryConstraint[] = [where('providerProfile.isVerified', '==', true)];
  if (key) {
    constraints.push(where('searchTerms', 'array-contains', key));
  } else if (params.category) {
    constraints.push(where('categoryIds', 'array-contains', params.category));
  }
  constraints.push(limit(50));
  const providersQuery = query(collection(db, INSTRUCTORS_COLLECTION), ...constraints);

  const snapshot = await getDocs(providersQuery);
  let providers = snapshot.docs
    .filter((doc) => !doc.data().activityKind)
    .map((doc) => providerSearchResultFromDoc(doc.id, doc.data()));
  if (key && params.category) {
    providers = providers.filter((p) => p.categoryIds?.includes(params.category!));
  }

  return applyProviderSearchFilters(providers, params);
}

/**
 * Verified providers within `radiusKm` of `center`, nearest-first with `distanceKm`: a
 * bounded geohash range search instead of the first 50 by doc id (which, located in Bari,
 * could all be in Milano). The same category constraint and in-memory filters as
 * searchProviders apply; distance, not `sortBy`, orders the result, as the near-me list
 * always has. Needs the (isVerified, geohash) and (isVerified, categoryIds, geohash)
 * composite indexes; the isVerified equality is also what the /instructors read rule needs.
 */
export async function searchProvidersNear(
  params: SearchParams,
  center: LatLng,
  radiusKm: number
): Promise<(ProviderSearchResult & { distanceKm: number })[]> {
  const filters: QueryConstraint[] = [where('providerProfile.isVerified', '==', true)];
  if (params.category) filters.push(where('categoryIds', 'array-contains', params.category));
  const near = await geoRangeQuery<ProviderSearchResult>({
    collectionPath: INSTRUCTORS_COLLECTION,
    filters,
    center,
    radiusKm,
    fromDoc: (id, data) => (data.activityKind ? null : providerSearchResultFromDoc(id, data)),
    getCoords: (p) => (p.location ? { lat: p.location.lat, lng: p.location.lng } : null),
  });
  return applyProviderSearchFilters(near, { ...params, sortBy: undefined });
}

/** Map an /instructors document to a search card. */
export function providerSearchResultFromDoc(
  id: string,
  data: DocumentData
): ProviderSearchResult {
  const profile = data.providerProfile || {};
  // Company badge/logo come from the `business` map only (providerType is owner-writable).
  // The result carries the public subset: the legal name is searchable, never displayed.
  const business = toPublicBusiness(readBusinessDetails(data.business));

  return {
    id,
    fullName: data.fullName || 'Unknown',
    avatarUrl: data.avatarUrl || undefined,
    rating: profile.rating || 0,
    reviewCount: profile.reviewCount || 0,
    isVerified: profile.isVerified || false,
    specialties: profile.specialties || [],
    categoryIds: (data.categoryIds as string[]) || [],
    searchTerms: Array.isArray(data.searchTerms) ? (data.searchTerms as string[]) : undefined,
    yearsOfExperience: profile.yearsOfExperience || 0,
    languages: profile.languages || [],
    // Denormalized cheapest service price (written by the seeder from the
    // /services subcollection) so cards can show "Da X €" without fetching
    // every provider's services.
    lowestPrice: typeof data.lowestPrice === 'number' ? data.lowestPrice : undefined,
    location:
      typeof data.lat === 'number' && typeof data.lng === 'number'
        ? { lat: data.lat, lng: data.lng, address: (data.city as string) ?? '' }
        : undefined,
    // Services live in the /instructors/{id}/services subcollection and are
    // fetched lazily on the detail page (useProviderServices). Search cards
    // don't render service-level info, so we return an empty array here.
    services: [],
    ...(business
      ? { isBusiness: true, business, ...(business.logoUrl ? { logoUrl: business.logoUrl } : {}) }
      : {}),
  } as ProviderSearchResult;
}

/** The in-memory filters and sort shared by the list and the radius search. */
export function applyProviderSearchFilters<T extends ProviderSearchResult>(
  input: T[],
  params: SearchParams
): T[] {
  let providers = [...input];
  // Apply text search filter
  if (params.query) {
    const queryLower = params.query.toLowerCase();
    const key = providerSearchKey(params.query);
    providers = providers.filter(
      (p) =>
        // What the query matched on in Firestore (category words included), then the
        // substring fallback for documents the backfill hasn't reached.
        (key !== '' && p.searchTerms?.includes(key)) ||
        p.fullName.toLowerCase().includes(queryLower) ||
        p.specialties.some((s) => s.toLowerCase().includes(queryLower)) ||
        p.services.some((s) => s.name.toLowerCase().includes(queryLower))
    );
  }

  // No second in-memory category pass: the Firestore constraint above is exact. The old
  // one re-filtered by substring against display names, which quietly re-introduced the
  // name coupling the query had just escaped.

  // Apply price filter
  if (params.minPrice !== undefined) {
    providers = providers.filter(
      (p) => p.services.some((s) => s.price >= params.minPrice!)
    );
  }
  if (params.maxPrice !== undefined) {
    providers = providers.filter(
      (p) => p.services.some((s) => s.price <= params.maxPrice!)
    );
  }

  // Apply rating filter
  if (params.rating) {
    providers = providers.filter((p) => p.rating >= params.rating!);
  }

  // Apply sorting
  if (params.sortBy) {
    switch (params.sortBy) {
      case 'price':
        providers.sort((a, b) => (a.lowestPrice || Infinity) - (b.lowestPrice || Infinity));
        break;
      case 'rating':
        providers.sort((a, b) => b.rating - a.rating);
        break;
      case 'availability':
        // Sort by next available date
        providers.sort((a, b) => {
          if (!a.nextAvailable) return 1;
          if (!b.nextAvailable) return -1;
          return a.nextAvailable.getTime() - b.nextAvailable.getTime();
        });
        break;
    }
  }

  return providers;
}

/**
 * The times a client can book with `providerId` for `serviceId` on the picker day `date`.
 *
 * Asks the getProviderSlots callable, which applies the provider's weekly hours, date
 * exceptions, notice, buffer and daily cap against their real bookings. It replaced a read of
 * per-date docs that nothing wrote, so every provider looked free 09:00–18:30 every day.
 */
export async function getProviderAvailability(
  providerId: string,
  serviceId: string,
  date: Date,
  /** Set when rescheduling, so the booking being moved doesn't hide its own current slot. */
  excludeBookingId?: string
): Promise<TimeSlot[]> {
  const slots = await fetchProviderSlots({
    instructorId: providerId,
    serviceId,
    date: localDateKey(date),
    // Spread rather than pass undefined: the callable encoder turns an undefined field into
    // an explicit null in the payload.
    ...(excludeBookingId ? { excludeBookingId } : {}),
  });
  return slots.map((s) => ({ time: s.time, startsAt: s.startsAt, isAvailable: true, isBooked: false }));
}

/**
 * Create a booking.
 *
 * Delegates to the `createBooking` Cloud Function. It used to write the document (and the
 * provider's availability slot) directly from the client, which meant the browser decided
 * the price and the status — firestore.rules now denies that outright.
 *
 * The callable resolves the service and computes pricing server-side, so the local
 * service-lookup and fee arithmetic that lived here are gone.
 */
export async function createBooking(data: BookingData): Promise<Booking> {
  const result = await createBookingFn({
    // `instructorId` is the canonical trainer link; BookingData still says providerId.
    instructorId: data.providerId,
    serviceId: data.serviceId,
    scheduledAt: data.scheduledAt.toISOString(),
    bookingType: toBookingType(data.locationType),
    promotionCode: data.promotionCode,
    usePoints: (data.pointsToUse ?? 0) > 0,
    userNotes: data.userNotes,
  });

  const created = await getBooking(result.bookingId);
  if (!created) throw new Error('Booking was created but could not be read back');
  return created;
}

/** BookingData still speaks LocationType; the booking document speaks BookingType. */
function toBookingType(locationType: LocationType): 'in_venue' | 'home_service' | 'virtual' | 'outdoor' {
  switch (locationType) {
  case 'online':
    return 'virtual';
  case 'home_visit':
    return 'home_service';
  default:
    return 'in_venue';
  }
}

/**
 * A booking document as the screens expect it.
 *
 * The server writes `durationMinutes` and `finalPrice` (createBooking, the slot engine and
 * the payment flow all speak those names); `src/types/booking.ts` still carries the older
 * `duration` / `totalPrice` the UI was built against. Reading a real document straight into
 * `Booking` therefore rendered "undefined min" and "NaN €" on the detail screen. Reconcile
 * the two shapes once, here, rather than in every component that shows a price or a length.
 */
export function bookingFromDoc(id: string, data: Record<string, unknown>): Booking {
  const raw = data as Partial<Booking> & { durationMinutes?: number; finalPrice?: number };
  return {
    ...(data as object),
    id,
    duration: raw.duration ?? raw.durationMinutes ?? 60,
    totalPrice: raw.totalPrice ?? raw.finalPrice ?? 0,
    // Trainer sessions are written with instructorName only (providerName belongs to venue
    // bookings), so every card that shows providerName rendered a "?" and no name for them.
    providerName: raw.providerName || raw.instructorName || undefined,
  } as Booking;
}

// Get user's bookings
export async function getUserBookings(
  userId: string,
  filters?: BookingFilters
): Promise<Booking[]> {
  let bookingsQuery = query(
    collection(db, BOOKINGS_COLLECTION),
    where('userId', '==', userId),
    orderBy('scheduledAt', 'desc')
  );

  if (filters?.status && filters.status !== 'all') {
    bookingsQuery = query(bookingsQuery, where('status', '==', filters.status));
  }

  if (filters?.dateFrom) {
    bookingsQuery = query(
      bookingsQuery,
      where('scheduledAt', '>=', Timestamp.fromDate(filters.dateFrom))
    );
  }

  if (filters?.dateTo) {
    bookingsQuery = query(
      bookingsQuery,
      where('scheduledAt', '<=', Timestamp.fromDate(filters.dateTo))
    );
  }

  const snapshot = await getDocs(bookingsQuery);
  return snapshot.docs.map((doc) => bookingFromDoc(doc.id, doc.data()));
}

// Get a single booking
export async function getBooking(bookingId: string): Promise<Booking | null> {
  const bookingDoc = await getDoc(doc(db, BOOKINGS_COLLECTION, bookingId));
  if (!bookingDoc.exists()) {
    return null;
  }
  return bookingFromDoc(bookingDoc.id, bookingDoc.data());
}

// Cancel a booking
/**
 * Cancel a booking.
 *
 * Delegates to the `cancelBooking` callable, which owns the client-vs-trainer branch, the
 * lateCancellation flag and the statusHistory entry. Rules deny a direct status write.
 */
export async function cancelBooking(
  bookingId: string,
  reason?: string
): Promise<void> {
  await cancelBookingFn({ bookingId, reason });
}

export interface RescheduleResult {
  bookingId: string;
  /** The instant the booking now starts at, echoed back by the server. */
  startsAt: string;
  scheduledEndAt: string;
}

/**
 * Move a booking to another slot.
 *
 * Delegates to the `rescheduleBooking` callable. This used to merge the picker's "HH:mm" into
 * a device-local Date and updateDoc the booking straight from the browser — which firestore.rules
 * denies outright (the owner may only touch userNotes/updatedAt), and which nobody validated
 * against the provider's hours or against the bookings already on the day.
 *
 * `startsAt` must be a slot's own instant, straight from getProviderSlots. A time the browser
 * assembled from a date plus "HH:mm" is an Italian time read in the device's zone, so it lands
 * on the wrong instant for anyone outside Europe/Rome.
 */
export async function rescheduleBooking(bookingId: string, startsAt: string): Promise<RescheduleResult> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<{ bookingId: string; startsAt: string }, RescheduleResult>(
    functions,
    'rescheduleBooking'
  );
  return (await fn({ bookingId, startsAt })).data;
}

/**
 * Look up a promotion code the way `createBooking` will apply it: active, inside its
 * validity window, and not used up. Returns the terms; the checkout turns them into an
 * amount with computeBookingPrice (a percentage depends on the price).
 *
 * This used to be a hardcoded mock that also wrote to a non-existent `bookings/temp`, so no
 * code ever applied — and the server ignored the mock codes anyway.
 */
export async function applyPromoCode(code: string): Promise<Discount> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) throw new Error('Invalid promo code');

  const snap = await getDocs(
    query(
      collection(db, 'promotions'),
      where('code', '==', normalized),
      where('isActive', '==', true),
      limit(1)
    )
  );
  const data = snap.docs[0]?.data() as
    | {
        discountType?: string;
        discountValue?: number;
        maxDiscount?: number | null;
        validFrom?: Timestamp;
        validUntil?: Timestamp;
        maxUses?: number | null;
        currentUses?: number;
      }
    | undefined;
  if (!data) throw new Error('Invalid promo code');

  const now = Date.now();
  const usable =
    (data.discountType === 'percentage' || data.discountType === 'fixed_amount') &&
    typeof data.discountValue === 'number' &&
    (!data.validFrom || data.validFrom.toMillis() <= now) &&
    (!data.validUntil || data.validUntil.toMillis() >= now) &&
    (data.maxUses == null || (data.currentUses ?? 0) < data.maxUses);
  if (!usable) throw new Error('Invalid promo code');

  return {
    code: normalized,
    type: data.discountType as Discount['type'],
    value: data.discountValue as number,
    maxDiscount: data.maxDiscount ?? null,
  };
}

// Calculate refund amount based on cancellation policy
export function calculateRefundAmount(booking: Booking): number {
  const now = new Date();
  const scheduledAt = booking.scheduledAt.toDate();
  const hoursUntilBooking = (scheduledAt.getTime() - now.getTime()) / (1000 * 60 * 60);

  // Full refund if cancelled more than 24 hours in advance
  if (hoursUntilBooking >= 24) {
    return booking.totalPrice;
  }
  
  // 50% refund if cancelled between 12-24 hours
  if (hoursUntilBooking >= 12) {
    return booking.totalPrice * 0.5;
  }
  
  // No refund if cancelled less than 12 hours before
  return 0;
}

// Check if booking can be cancelled
export function canCancelBooking(booking: Booking): boolean {
  if (isCancelled(booking.status) || isDelivered(booking.status)) {
    return false;
  }
  
  const now = new Date();
  const scheduledAt = booking.scheduledAt.toDate();
  
  // Can't cancel if booking is in the past
  if (scheduledAt < now) {
    return false;
  }
  
  return true;
}

// Validate booking time (can't book in the past, must be X hours in advance)
export function validateBookingTime(date: Date, minHoursInAdvance: number = 2): {
  valid: boolean;
  error?: string;
} {
  const now = new Date();
  
  // Can't book in the past
  if (date < now) {
    return { valid: false, error: 'Cannot book in the past' };
  }
  
  // Must be at least X hours in advance
  const hoursUntilBooking = (date.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursUntilBooking < minHoursInAdvance) {
    return {
      valid: false,
      error: `Must book at least ${minHoursInAdvance} hours in advance`,
    };
  }
  
  return { valid: true };
}

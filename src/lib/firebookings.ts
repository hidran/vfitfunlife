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
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from './firebase/config';
import type {
  Booking,
  BookingData,
  ProviderSearchResult,
  TimeSlot,
  SearchParams,
  Discount,
  BookingFilters,
} from '@/types/booking';

const BOOKINGS_COLLECTION = 'bookings';
const INSTRUCTORS_COLLECTION = 'instructors';
const AVAILABILITY_COLLECTION = 'availability';

// Search providers based on filters. Reads the public /instructors mirror
// (allowed under firestore.rules for unauthenticated and authenticated users).
export async function searchProviders(params: SearchParams): Promise<ProviderSearchResult[]> {
  // When a category is specified, push it into the Firestore query as an
  // array-contains constraint so the limit doesn't burn through unrelated docs
  // before in-memory filtering can apply (with 300+ seeded trainers, plain
  // limit(50) starves rare categories whose docs sort late by doc id).
  const constraints: QueryConstraint[] = [where('providerProfile.isVerified', '==', true)];
  if (params.category) {
    constraints.push(where('providerProfile.specialties', 'array-contains', params.category));
  }
  constraints.push(limit(50));
  const providersQuery = query(collection(db, INSTRUCTORS_COLLECTION), ...constraints);

  const snapshot = await getDocs(providersQuery);
  let providers = snapshot.docs.map((doc) => {
    const data = doc.data();
    const profile = data.providerProfile || {};

    return {
      id: doc.id,
      fullName: data.fullName || 'Unknown',
      avatarUrl: data.avatarUrl || undefined,
      rating: profile.rating || 0,
      reviewCount: profile.reviewCount || 0,
      isVerified: profile.isVerified || false,
      specialties: profile.specialties || [],
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
    } as ProviderSearchResult;
  });

  // Apply text search filter
  if (params.query) {
    const queryLower = params.query.toLowerCase();
    providers = providers.filter(
      (p) =>
        p.fullName.toLowerCase().includes(queryLower) ||
        p.specialties.some((s) => s.toLowerCase().includes(queryLower)) ||
        p.services.some((s) => s.name.toLowerCase().includes(queryLower))
    );
  }

  // Apply category filter
  if (params.category) {
    providers = providers.filter((p) =>
      p.specialties.some((s) => s.toLowerCase().includes(params.category!.toLowerCase()))
    );
  }

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

// Get provider availability for a specific date
export async function getProviderAvailability(
  providerId: string,
  date: Date
): Promise<TimeSlot[]> {
  const dateStr = date.toISOString().split('T')[0];
  
  const availabilityDoc = await getDoc(
    doc(db, INSTRUCTORS_COLLECTION, providerId, AVAILABILITY_COLLECTION, dateStr)
  );

  if (!availabilityDoc.exists()) {
    // Return default empty slots if no availability set
    return generateDefaultTimeSlots();
  }

  const data = availabilityDoc.data();
  return (data.slots || []).map((slot: any) => ({
    time: slot.start,
    isAvailable: !slot.isBooked && slot.isAvailable !== false,
    isBooked: slot.isBooked || false,
  }));
}

// Generate default time slots (9 AM to 6 PM, 30 min intervals)
function generateDefaultTimeSlots(): TimeSlot[] {
  const slots: TimeSlot[] = [];
  for (let hour = 9; hour <= 18; hour++) {
    slots.push(
      { time: `${hour.toString().padStart(2, '0')}:00`, isAvailable: true, isBooked: false },
      { time: `${hour.toString().padStart(2, '0')}:30`, isAvailable: true, isBooked: false }
    );
  }
  return slots;
}

// Create a new booking
export async function createBooking(data: BookingData): Promise<Booking> {
  const batch = writeBatch(db);
  
  // Get provider data for denormalization
  const providerDoc = await getDoc(doc(db, INSTRUCTORS_COLLECTION, data.providerId));
  if (!providerDoc.exists()) {
    throw new Error('Provider not found');
  }
  const providerData = providerDoc.data();

  // Get service details from /instructors/{id}/services/{serviceId}.
  // Falls back to the legacy inline providerProfile.servicePricing[] for older
  // documents that still embed services on the provider doc.
  let service: {
    name: string;
    price: number;
    durationMinutes?: number;
    description?: string;
  } | null = null;
  const serviceDoc = await getDoc(
    doc(db, INSTRUCTORS_COLLECTION, data.providerId, 'services', data.serviceId)
  );
  if (serviceDoc.exists()) {
    const s = serviceDoc.data();
    service = {
      name: s.name ?? s.serviceName ?? 'Service',
      price: s.price,
      durationMinutes: s.durationMinutes,
      description: s.description,
    };
  } else {
    const inline = (providerData.providerProfile?.servicePricing ?? []).find(
      (s: { id: string }) => s.id === data.serviceId
    );
    if (inline) {
      service = {
        name: inline.serviceName ?? inline.name ?? 'Service',
        price: inline.price,
        durationMinutes: inline.durationMinutes,
        description: inline.description,
      };
    }
  }
  if (!service) {
    throw new Error('Service not found');
  }

  // Calculate pricing
  const platformFee = service.price * 0.05; // 5% platform fee
  const totalPrice = service.price + platformFee;

  // Create booking document
  const bookingRef = doc(collection(db, BOOKINGS_COLLECTION));
  const bookingData = {
    id: bookingRef.id,
    userId: '', // Will be set from auth context
    providerId: data.providerId,
    serviceId: data.serviceId,
    serviceName: service.name,
    providerName: providerData.fullName || 'Unknown',
    providerAvatar: providerData.avatarUrl || null,
    
    // Schedule
    scheduledAt: Timestamp.fromDate(data.scheduledAt),
    scheduledEndAt: Timestamp.fromDate(
      new Date(data.scheduledAt.getTime() + data.duration * 60000)
    ),
    duration: data.duration,
    
    // Location
    locationType: data.locationType,
    location: data.location || null,
    
    // Pricing
    servicePrice: service.price,
    platformFee,
    discountAmount: 0,
    pointsUsed: data.pointsToUse || 0,
    pointsValue: (data.pointsToUse || 0) * 0.01, // 1 point = €0.01
    totalPrice,
    
    // Promotion
    promotionCode: data.promotionCode || null,
    
    // Status
    status: 'pending',
    paymentStatus: 'pending',
    paymentMethod: data.paymentMethod,
    
    // Notes
    userNotes: data.userNotes || null,
    
    // Review
    hasReviewed: false,
    
    // Timestamps
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  batch.set(bookingRef, bookingData);

  // Mark time slot as booked in provider's availability
  const dateStr = data.scheduledAt.toISOString().split('T')[0];
  const timeStr = data.scheduledAt.toTimeString().slice(0, 5);
  const availabilityRef = doc(
    db,
    INSTRUCTORS_COLLECTION,
    data.providerId,
    AVAILABILITY_COLLECTION,
    dateStr
  );
  
  // This is a simplified version - in production, you'd update specific slot
  batch.update(availabilityRef, {
    [`slots.${timeStr}.isBooked`]: true,
    [`slots.${timeStr}.bookingId`]: bookingRef.id,
    updatedAt: serverTimestamp(),
  });

  await batch.commit();

  return { ...bookingData, id: bookingRef.id } as unknown as Booking;
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
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Booking);
}

// Get a single booking
export async function getBooking(bookingId: string): Promise<Booking | null> {
  const bookingDoc = await getDoc(doc(db, BOOKINGS_COLLECTION, bookingId));
  if (!bookingDoc.exists()) {
    return null;
  }
  return { id: bookingDoc.id, ...bookingDoc.data() } as Booking;
}

// Cancel a booking
export async function cancelBooking(
  bookingId: string,
  reason?: string
): Promise<void> {
  const bookingRef = doc(db, BOOKINGS_COLLECTION, bookingId);
  
  await updateDoc(bookingRef, {
    status: 'cancelled',
    cancellationReason: reason || null,
    cancelledBy: 'user',
    cancelledAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// Reschedule a booking
export async function rescheduleBooking(
  bookingId: string,
  newDate: Date,
  newTime: string
): Promise<void> {
  const [hours, minutes] = newTime.split(':').map(Number);
  const scheduledAt = new Date(newDate);
  scheduledAt.setHours(hours, minutes, 0, 0);

  const bookingRef = doc(db, BOOKINGS_COLLECTION, bookingId);
  const booking = await getDoc(bookingRef);
  
  if (!booking.exists()) {
    throw new Error('Booking not found');
  }

  const bookingData = booking.data() as Booking;
  const duration = bookingData.duration;
  const scheduledEndAt = new Date(scheduledAt.getTime() + duration * 60000);

  await updateDoc(bookingRef, {
    scheduledAt: Timestamp.fromDate(scheduledAt),
    scheduledEndAt: Timestamp.fromDate(scheduledEndAt),
    updatedAt: serverTimestamp(),
  });
}

// Apply promotion code
export async function applyPromoCode(
  code: string,
  bookingId: string
): Promise<Discount> {
  // In a real implementation, this would validate against a promotions collection
  // and check usage limits, validity dates, etc.
  
  // Mock implementation for now
  const mockDiscounts: Record<string, Discount> = {
    'WELCOME10': { code: 'WELCOME10', type: 'percentage', value: 10, amount: 0 },
    'SAVE20': { code: 'SAVE20', type: 'percentage', value: 20, amount: 0 },
    'FLAT15': { code: 'FLAT15', type: 'fixed_amount', value: 15, amount: 15 },
  };

  const discount = mockDiscounts[code.toUpperCase()];
  if (!discount) {
    throw new Error('Invalid promo code');
  }

  // Update booking with discount
  const bookingRef = doc(db, BOOKINGS_COLLECTION, bookingId);
  await updateDoc(bookingRef, {
    promotionCode: code.toUpperCase(),
    updatedAt: serverTimestamp(),
  });

  return discount;
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
  if (booking.status === 'cancelled' || booking.status === 'completed') {
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

// Check if booking can be rescheduled
export function canRescheduleBooking(booking: Booking): boolean {
  if (booking.status === 'cancelled' || booking.status === 'completed') {
    return false;
  }
  
  const now = new Date();
  const scheduledAt = booking.scheduledAt.toDate();
  const hoursUntilBooking = (scheduledAt.getTime() - now.getTime()) / (1000 * 60 * 60);
  
  // Can reschedule if at least 4 hours before booking
  return hoursUntilBooking >= 4;
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

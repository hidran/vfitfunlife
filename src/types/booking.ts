import { Timestamp, GeoPoint } from 'firebase/firestore';

// Re-export types from firebase.ts for convenience
export type {
  BookingStatus,
  PaymentStatus,
  PaymentMethod,
  BookingType,
  StatusActorRole,
  BookingStatusHistoryEntry,
  PaymentConfirmationMethod,
  BookingPaymentConfirmation,
} from './firebase';

// Additional location type for provider bookings
export type LocationType = 'in_person' | 'online' | 'home_visit';

// Extended Booking interface that works with both venue and provider bookings
export interface Booking {
  id: string;
  userId: string;
  
  // Venue/Provider reference (one will be populated based on booking type)
  venueId?: string;
  providerId?: string;
  serviceId: string;
  instructorId?: string | null;

  // Denormalized data
  userName?: string;
  userPhone?: string;
  userEmail?: string | null;
  
  // Venue info (for venue bookings)
  venueName?: string;
  venueAddress?: string;
  
  // Provider info (for provider bookings)
  providerName?: string;
  providerAvatar?: string | null;
  serviceName?: string;
  instructorName?: string | null;

  // Booking details
  bookingType?: import('./firebase').BookingType;
  locationType: LocationType;
  serviceAddress?: {
    street: string;
    city: string;
    postalCode: string;
    location: GeoPoint;
  } | null;
  location?: {
    address?: string;
    lat?: number;
    lng?: number;
    meetingLink?: string;
  };

  // Schedule
  scheduledAt: Timestamp;
  scheduledEndAt?: Timestamp;
  duration: number;
  durationMinutes?: number;

  // Status
  status: import('./firebase').BookingStatus;
  paymentStatus: import('./firebase').PaymentStatus;

  // Pricing
  servicePrice: number;
  originalPrice?: number;
  platformFee: number;
  homeServiceFee?: number;
  discountAmount: number;
  pointsUsed: number;
  pointsValue?: number;
  pointsEarned?: number;
  totalPrice: number;
  finalPrice?: number;
  depositAmount?: number;
  depositPaid?: boolean;

  // Promotion
  promotionId?: string | null;
  promotionCode?: string | null;

  // Payment
  paymentMethod?: import('./firebase').PaymentMethod | null;
  stripePaymentIntentId?: string | null;

  // Notes
  userNotes?: string | null;
  internalNotes?: string | null;
  notes?: string;

  // Cancellation
  cancelledAt?: Timestamp | null;
  cancelledBy?: 'user' | 'instructor' | 'venue' | 'admin' | null;
  cancellationReason?: string | null;
  refundAmount?: number | null;
  lateCancellation?: boolean;

  // Status audit trail (append-only; written by Cloud Functions only)
  statusHistory?: import('./firebase').BookingStatusHistoryEntry[];

  // Manual payment confirmation (payments happen off-platform, directly to the trainer)
  paymentConfirmation?: import('./firebase').BookingPaymentConfirmation | null;
  completionReminderSentAt?: Timestamp | null;

  // Review
  hasReviewed: boolean;
  reviewId?: string | null;

  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  confirmedAt?: Timestamp | null;
  completedAt?: Timestamp | null;
}

export interface TimeSlot {
  time: string;
  isAvailable: boolean;
  isBooked: boolean;
  /** The slot's instant (ISO), from getProviderSlots. createBooking's scheduledAt is this. */
  startsAt?: string;
}

export interface SearchParams {
  query?: string;
  category?: string;
  serviceType?: string;
  minPrice?: number;
  maxPrice?: number;
  date?: Date;
  location?: {
    lat: number;
    lng: number;
    radius: number;
  };
  sortBy?: 'price' | 'rating' | 'distance' | 'availability';
  availability?: 'today' | 'this_week' | 'this_month';
  rating?: number;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
  isActive: boolean;
}

export interface ProviderSearchResult {
  id: string;
  fullName: string;
  avatarUrl?: string;
  rating: number;
  reviewCount: number;
  isVerified: boolean;
  specialties: string[];
  yearsOfExperience: number;
  languages: string[];
  services: Service[];
  location?: {
    address: string;
    lat: number;
    lng: number;
  };
  distance?: number;
  nextAvailable?: Date;
  lowestPrice?: number;
  photoUrls?: string[];
}

export interface BookingData {
  providerId: string;
  serviceId: string;
  scheduledAt: Date;
  duration: number;
  locationType: LocationType;
  location?: {
    address?: string;
    lat?: number;
    lng?: number;
  };
  userNotes?: string;
  promotionCode?: string;
  pointsToUse?: number;
  paymentMethod: import('./firebase').PaymentMethod;
}

export interface Discount {
  code: string;
  type: 'percentage' | 'fixed_amount';
  value: number;
  amount: number;
}

export interface PaymentMethodInfo {
  id: string;
  type: 'card' | 'wallet';
  last4?: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
}

export interface BookingFilters {
  status?: import('./firebase').BookingStatus | 'all';
  dateFrom?: Date;
  dateTo?: Date;
  providerId?: string;
}

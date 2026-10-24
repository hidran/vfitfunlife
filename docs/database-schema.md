# Database Schema - Cloud Firestore

## Collection Structure

```
/users/{userId}
  /addresses/{addressId}
  /notifications/{notificationId}
  /pointsTransactions/{transactionId}
  /userChallenges/{challengeId}
/venues/{venueId}
  /services/{serviceId}
  /reviews/{reviewId}
/instructors/{instructorId}
  /reviews/{reviewId}
  /availability/{dateId}
/fitnessClasses/{classId}
  /schedules/{scheduleId}
/bookings/{bookingId}
/classBookings/{bookingId}
/events/{eventId}
  /registrations/{registrationId}
/serviceCategories/{categoryId}
/vipPlans/{planId}
/challenges/{challengeId}
/promotions/{promotionId}
/streamingSchedule/{scheduleId}
/recipes/{recipeId}
/businessVat/{vatNumber}
```

## Document Schemas

### Users Collection
```typescript
// /users/{userId}
interface User {
  uid: string;
  email: string | null;
  phone: string | null;
  fullName: string;
  avatarUrl: string | null;
  dateOfBirth: Timestamp | null;

  // Role & access control (audit sync 2026-05)
  role: 'superadmin' | 'admin' | 'provider' | 'customer';
  permissions: Permission[];        // string[]; see functions/src/types.ts for the full Permission union
  userType: UserType | null;        // provider category (e.g. 'personal_trainer', 'yoga_teacher'); null for non-providers. Also referenced by firestore.rules.
  providerProfile: ProviderProfile | null; // populated for providers; see ProviderProfile in functions/src/types.ts
  isActive: boolean;                // soft-deactivation flag enforced by admin tooling
  isVerified: boolean;              // top-level verification (mirrors providerProfile.isVerified for providers)
  providerType?: 'individual' | 'business'; // kind of provider account; absent => 'individual'. 'business' = a company or association (P.IVA / codice fiscale holder), always approved manually; its company data lives in instructors/{uid}.business
  businessConvertedAt?: Timestamp;  // set by convertBusinessToIndividual (admin turned the company back into an individual); lets the account apply as a company again without an admin reject (applyAsProvider), deleted by the approval of that company application (commitProviderDecision). Never owner-writable.
  // Derived admin-index fields, written only by the onUserWriteAdminIndex trigger (and
  // scripts/backfill-search-tokens.mjs) — see src/lib/admin/adminIndex.ts: searchTokens,
  // adminHidden, providerVerification ('verified' | 'pending' | 'rejected' | null) and
  providerKind?: 'individual' | 'business' | null; // providerType for providers/applicants (absent => 'individual'), null for everyone else; the /admin/providers type filter (B8). Existing docs get it on their next write or from the backfill script.

  // VIP Status
  isVip: boolean;
  vipExpiresAt: Timestamp | null;
  vipPlanId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  
  // Balances
  pointsBalance: number;
  walletBalance: number;
  
  // Preferences
  preferredLanguage: 'it' | 'en';
  preferredSection: 'fit' | 'fun' | 'life';
  notificationsEnabled: boolean;
  
  // Push tokens (for FCM)
  fcmTokens: { token: string; platform: 'ios' | 'android' | 'web'; updatedAt: Timestamp }[];
  
  // Referral
  referralCode: string;
  referredBy: string | null;
  referralCount: number;
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastLoginAt: Timestamp;
}

// /users/{userId}/addresses/{addressId}
interface UserAddress {
  label: string;                  // 'Casa', 'Ufficio', 'Palestra'
  street: string;
  streetNumber: string;
  city: string;
  postalCode: string;
  province: string;
  country: string;
  location: GeoPoint;
  geohash: string;
  isDefault: boolean;
  createdAt: Timestamp;
}

// /users/{userId}/notifications/{notificationId}
interface Notification {
  title: string;
  body: string;
  type: 'booking_reminder' | 'booking_confirmed' | 'booking_cancelled' | 
        'promo' | 'event' | 'points_earned' | 'vip' | 'challenge' | 'system';
  data: Record<string, any>;      // Deep link data
  imageUrl: string | null;
  isRead: boolean;
  createdAt: Timestamp;
}

// /users/{userId}/pointsTransactions/{transactionId}
interface PointsTransaction {
  points: number;                 // Positive = earned, Negative = spent
  type: 'earned' | 'spent' | 'expired' | 'bonus' | 'refund';
  source: 'booking' | 'review' | 'referral' | 'challenge' | 'promotion' | 'welcome' | 'manual';
  sourceId: string | null;
  description: string;
  balanceAfter: number;
  createdAt: Timestamp;
}
```

### Venues Collection
```typescript
// /venues/{venueId}
interface Venue {
  name: string;
  slug: string;
  type: 'gym' | 'wellness_center' | 'spa' | 'beauty_salon' | 'school' | 'studio' | 'outdoor_space' | 'event_space';
                                  // Canonical union: VenueType in src/types/venue.ts (mirrored in functions/src/types.ts).
                                  // Only gym, school and studio host group courses (COURSE_VENUE_TYPES / hostsCourses(type));
                                  // `/fit/gyms` ("Palestre e scuole" / "Gyms & schools") lists exactly those three.
  section: 'fit' | 'fun' | 'life';
  
  // Contact
  phone: string;
  email: string;
  website: string | null;
  whatsapp: string | null;
  
  // Location
  address: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  location: GeoPoint;
  geohash: string;
  
  // Details
  description: string;
  shortDescription: string;
  openingHours: {
    [day: string]: { open: string; close: string; isClosed: boolean };
  };
  amenities: string[];            // ['parking', 'wifi', 'showers', 'lockers', 'bar', 'pool']
  
  // Media
  coverImage: string;
  images: string[];
  virtualTourUrl: string | null;
  
  // Ratings
  ratingAvg: number;
  reviewCount: number;
  
  // Flags
  isPartner: boolean;             // "Anche noi siamo qui" badge
  isFeatured: boolean;
  isActive: boolean;

  // Ownership & partnership (src/types/venue.ts). The field is `ownerId`, never `ownerUid`.
  ownerId?: string;               // uid of the provider that owns/manages the venue; written by the company approval
                                  // (biz_<uid>) or an admin; read by the managesVenue rule and by /admin/venues
                                  // (read-only Owner column linking to the provider)
  partnerStatus?: 'pending' | 'active' | 'suspended'; // 'active' is required to publish/book a timetable
  memberDiscountPercent?: number;
  partnerInstructorExtraPercent?: number;
  // Lifecycle marker, set only on a company venue the SYSTEM switched off (rejection, conversion to
  // individual, deletion of the owner); a later approval reactivates only a venue that carries it, an
  // admin's manual isActive: false (no marker) stays off. Cleared (null) on reactivation.
  deactivatedBy?: 'lifecycle' | null;
  deactivatedAt?: Timestamp | null;
  
  // Search
  searchKeywords: string[];
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Business venues. Approving a company (providerType 'business', business.venueType any venue type but 'none')
// creates /venues/biz_<providerUid> INSIDE the approval transaction (commitProviderDecision, with
// functions/src/providers/businessVenue.ts): a deterministic id written with `create`, so a racing second
// approval fails instead of overwriting; `venue_exists` is raised only when a venue at that id belongs to
// someone else. Fields: name = business.displayName, slug (name + city, minted once), type = business.venueType,
// address, city, ownerId = the provider's uid, partnerStatus 'pending', isPartner false, isActive true, discounts 0,
// rating 0. lat/lng are flat numbers (not a GeoPoint), copied from instructors/{uid} when saved and kept in step by
// syncBusinessVenueLocation (field-precise: lat/lng, city, and business.displayName -> name; the slug never
// changes); syncVenueGeohash derives `geohash`. The link back is instructors/{uid}.business.venueId. Admins promote
// it to a partner (partnerStatus) on the venue page. Venue writes are admin-only in the rules.
// Re-approval reactivates a system-deactivated venue; rejection, convertBusinessToIndividual and deleteUserCascade
// deactivate it (never delete). A company without premises (venueType absent or 'none') has no venue.

// /venues/{venueId}/services/{serviceId}
interface VenueService {
  categoryId: string;
  categorySlug: string;
  name: string;
  description: string;
  
  // Pricing
  price: number;
  vipPrice: number | null;
  discountedPrice: number | null;
  discountEndsAt: Timestamp | null;
  
  // Duration
  durationMinutes: number;
  
  // Home service
  isHomeService: boolean;
  homeServiceFee: number;
  homeServiceMinDistance: number;
  homeServiceMaxDistance: number;
  
  // Media
  images: string[];
  
  // Availability
  isActive: boolean;
  requiresDeposit: boolean;
  depositAmount: number | null;
  
  createdAt: Timestamp;
}
```

### Instructors Collection
```typescript
// /instructors/{instructorId}
interface Instructor {
  userId: string | null;          // Link to user account if registered
  venueId: string | null;         // NULL if freelance
  
  // Profile
  fullName: string;
  avatarUrl: string | null;
  coverImage: string | null;
  videoIntroUrl: string | null;
  bio: string;
  shortBio: string;
  
  // Professional
  specialties: string[];          // ['yoga', 'pilates', 'crossfit', 'personal_training']
  certifications: string[];
  experienceYears: number;
  languages: string[];
  
  // Ratings
  ratingAvg: number;
  reviewCount: number;
  completedSessions: number;
  
  // Pricing
  hourlyRate: number;
  sessionRate: number | null;     // Fixed price per session
  
  // Home Service
  homeServiceAvailable: boolean;
  homeServiceRadiusKm: number;
  homeServiceFee: number;
  serviceAreaCenter: GeoPoint | null;
  serviceAreaGeohash: string | null;
  
  // Services offered
  services: {
    serviceId: string;
    serviceName: string;
    customPrice: number | null;
  }[];
  
  // Contact (shown after booking)
  phone: string | null;
  email: string | null;
  
  // Flags
  isVerified: boolean;
  isFeatured: boolean;
  isActive: boolean;
  acceptingNewClients: boolean;

  // Business accounts (absent for individual providers; users/{uid}.providerType === 'business')
  providerType?: 'individual' | 'business'; // denormalized from users/{uid}
  business?: {
    legalName: string;              // ragione sociale; admin-verified, NOT owner-editable (rules refuse it, also while pending)
    vatNumber: string;              // Italian tax id, 11 digits + checksum: the P.IVA, or an association's codice fiscale (ASD/SSD without a P.IVA); admin-verified, NOT owner-editable (rules refuse it, also while pending)
    legalForm?: 'company' | 'sole_trader' | 'association' | 'other'; // always written since B3b ('company' when the applicant gave none); absent on older docs => 'company'. Admin-verified, NOT owner-editable
    affiliationNumber?: string;     // optional CONI / RASD / ente di promozione registration, <= 40 chars, "" when none; informational, shown in the admin UI only (not on the public page) — not secret: this doc is publicly readable once verified. NOT owner-editable
    displayName: string;            // shown publicly; copied to name/fullName, so cards/search/bookings show the company name
    description?: string;           // public company description
    website?: string | null;        // public website URL
    logoUrl?: string | null;        // public logo (Storage URL)
    city?: string;                  // public city
    venueType?: 'gym' | 'wellness_center' | 'spa' | 'beauty_salon' | 'school' | 'studio' | 'outdoor_space' | 'event_space' | 'none'; // premises asked for at signup (absent => 'none'; 'none' => no venue on approval). Admin-reviewed, NOT owner-editable
    address?: string | null;        // street address of the venue created on approval (required with a venue type other than 'none'); null for 'none'. NOT owner-editable
    venueId?: string | null;        // 'biz_<uid>', set only by the approval transaction. NOT owner-editable
  };
  // For a business, public name/fullName === business.displayName: an owner update that touches any of
  // name, fullName or business.displayName must leave all three equal (rule businessNameMirrorOk, S-5).
  // Owner client writes (firestore.rules, B4): `business` can't be created with the doc, added or
  // removed; legalName/vatNumber/legalForm/affiliationNumber and the venue keys venueType/address/venueId never change; no other keys; changed
  // values must fit displayName 1–120 (non-blank), description ≤ 1000, city ≤ 80, website null or
  // http(s) ≤ 200, logoUrl null or https ≤ 500. Admins may change anything, but changes to
  // legalName/vatNumber/legalForm/affiliationNumber should go through the updateBusinessTaxId
  // callable so the businessVat claim moves too; convertBusinessToIndividual removes the map
  // (FieldValue.delete(), never null). Approving a business needs the reviewed vatNumber +
  // legalName, legalForm, affiliationNumber, venueType and address (decideProviderApplication's expectedReview) and the businessVat claim on that
  // vatNumber held by this uid. updateBusinessTaxId queries `business.vatNumber ==` (automatic
  // single-field index on this nested field — do not exempt it).

  // Booking availability (functions/src/availability/slots.ts is the single source of truth
  // for this shape). Missing or empty means every day is switched off deliberately — it does
  // NOT mean "never set up": every provider starts on the default schedule below, written by
  // decideProviderApplication (on approval) and by the one-time backfillAvailability /
  // backfillSelfRegisteredProviders migrations. Written only by the updateMyAvailability
  // callable (client writes to this field are denied by firestore.rules); read by
  // getProviderSlots and by createBooking's transactional availability check.
  availabilitySchedule: {
    dayOfWeek: number;            // 0 = Sunday … 6 = Saturday
    startTime: string;            // "HH:mm", Europe/Rome wall-clock
    endTime: string;              // "HH:mm", Europe/Rome wall-clock
    isAvailable: boolean;
  }[];                            // Default (DEFAULT_WEEKLY_HOURS): Mon–Fri 09:00–17:00

  bookingRules: {
    bufferMinutes: number;        // 0–120, default 15 — kept clear on both sides of a booking
    minAdvanceNoticeHours: number; // 0–168, default 24
    maxBookingsPerDay: number;    // 1–50, default 8
  };

  // Set only once the provider has saved on /provider/availability themselves. Missing means
  // they are still on the unreviewed default schedule above — the signal the provider
  // dashboard uses to show the "review your hours" banner (dashboardBannerKind in
  // src/lib/availability/adapter.ts) rather than "you have no hours".
  availabilityUpdatedAt: Timestamp | null;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// /instructors/{instructorId}/availability/{dateId}
// dateId format: "2026-01-15" (Europe/Rome calendar day, matches the doc id). A date
// exception to the weekly hours above — a day off, or that day's own custom hours. Public
// read (clients need to know a provider is off); written only by updateMyAvailability
// (client writes denied by firestore.rules).
interface InstructorAvailabilityOverride {
  date: string;                   // "YYYY-MM-DD", same as the doc id
  isAvailable: boolean;           // false = closed all day
  windows: {                      // custom hours for the day; [] when isAvailable is false
    start: string;                // "HH:mm"
    end: string;                  // "HH:mm"
  }[];
  reason?: string;                // e.g. "Ferie" — optional, shown to the provider only
  updatedAt: Timestamp;
}

// /instructors/{instructorId}/bookingDays/{dateId}
// Server-only lock createBooking reads and writes inside its transaction so two concurrent
// requests for the same provider and day never both succeed for the same slot. No client
// read or write (firestore.rules denies both).
interface BookingDayLock {
  lastBookingId: string;
  updatedAt: Timestamp;
}
```

### Bookings Collection
```typescript
// /bookings/{bookingId}
interface Booking {
  // References
  userId: string;
  // Absent for trainer sessions (home / online / outdoor), which have no venue.
  venueId: string | null;
  serviceId: string;
  // The canonical trainer link. Older documents carried `providerId` instead; the P0-1
  // migration backfilled this from it, and all booking queries key on this field.
  instructorId: string | null;
  
  // Denormalized data (for queries without joins)
  userName: string;
  userPhone: string;
  userEmail: string | null;
  venueName: string;
  venueAddress: string;
  serviceName: string;
  instructorName: string | null;
  
  // Booking details
  bookingType: 'in_venue' | 'home_service' | 'virtual' | 'outdoor';
  
  // For home services
  serviceAddress: {
    street: string;
    city: string;
    postalCode: string;
    location: GeoPoint;
  } | null;
  
  // Schedule
  scheduledAt: Timestamp;
  scheduledEndAt: Timestamp;
  durationMinutes: number;
  
  // Status
  // P0-1 (2026-08-08): migrated from
  // 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'.
  // Transitions are written ONLY by Cloud Functions; firestore.rules denies client and
  // trainer writes to this field. See docs/superpowers/specs/2026-08-08-booking-manual-payment-design.md
  status:
    | 'requested'            // client asked; trainer has not responded
    | 'accepted'             // trainer took it
    | 'declined'             // trainer refused
    | 'cancelled_by_client'
    | 'cancelled_by_trainer' // also covers admin/venue cancellations — see actorRole below
    | 'completed'            // trainer attested the session happened
    | 'no_show'              // client did not attend: no points, no completedAt
    | 'payment_confirmed';   // off-platform payment recorded by the trainer
  
  // Pricing
  originalPrice: number;
  discountAmount: number;
  homeServiceFee: number;
  finalPrice: number;
  depositAmount: number;
  depositPaid: boolean;
  
  // Points
  pointsEarned: number;
  pointsUsed: number;
  pointsValue: number;            // Monetary value of points used
  
  // Promotion
  promotionId: string | null;
  promotionCode: string | null;
  
  // Payment
  paymentStatus: 'pending' | 'deposit_paid' | 'paid' | 'refunded' | 'partial_refund';
  paymentMethod: 'card' | 'wallet' | 'points' | 'cash' | 'mixed' | null;
  stripePaymentIntentId: string | null;
  
  // Notes
  userNotes: string | null;
  internalNotes: string | null;
  
  // Cancellation
  cancelledAt: Timestamp | null;
  // Retained after the P0-1 status migration: this has five values where the status enum
  // has two cancellation states, so it stays the authoritative attribution source for
  // pre-migration records.
  cancelledBy: 'user' | 'instructor' | 'venue' | 'admin' | null;
  cancellationReason: string | null;
  refundAmount: number | null;
  // Cancelled <24h before the slot. PILOT: flagged for data only, never charged.
  lateCancellation?: boolean;

  // Status audit trail — append-only, written by Cloud Functions only.
  //
  // Attribution comes from actorRole, NOT from the status: an admin cancelling a booking
  // still lands it in 'cancelled_by_trainer', so any trainer-reliability metric that reads
  // the status alone will blame the trainer. P0-2 must key on actorRole.
  // actorUid is the literal string 'migration' for entries synthesised by the backfill.
  statusHistory: Array<{
    status: BookingStatus;
    actorUid: string;
    actorRole: 'client' | 'trainer' | 'admin' | 'system';
    at: Timestamp;
    note?: string;
  }>;

  // Every time the session was moved — append-only, written only by the rescheduleBooking
  // callable (firestore.rules denies client writes of scheduledAt, and the browser cannot be
  // trusted to build a Europe/Rome instant). Absent on a booking that has never moved.
  //
  // `at` is a concrete Timestamp, not a server sentinel: arrayUnion rejects those. It is
  // therefore the server's clock at the moment of the write, not the commit time.
  rescheduleHistory?: Array<{
    from: Timestamp;                 // the start it had
    to: Timestamp;                   // the start it was given
    actorUid: string;
    actorRole: 'client' | 'trainer' | 'staff';
    at: Timestamp;
  }>;

  // Manual payment confirmation. Payments happen off-platform, directly to the trainer;
  // the platform only records them. Stripe split payments are Phase 2.
  paymentConfirmation?: {
    method: 'cash' | 'satispay' | 'bank_transfer' | 'other';
    amount: number;                  // prefilled from finalPrice, trainer-editable, revalidated server-side
    confirmedByTrainerAt: Timestamp;
    clientResponse: 'confirmed' | 'disputed' | null;
    clientRespondedAt: Timestamp | null;
    autoConfirmed: boolean;          // true when the 48h job closed it
    disputeReason?: string;
  } | null;

  // Guards the 2h "mark it complete" nudge against re-sending. Initialised to null on
  // create and by the migration — Firestore cannot query for an absent field.
  completionReminderSentAt?: Timestamp | null;

  // Review
  hasReviewed: boolean;
  reviewId: string | null;
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  confirmedAt: Timestamp | null;
  completedAt: Timestamp | null;
}
```

### Fitness Classes Collection
```typescript
// /fitnessClasses/{classId}
interface FitnessClass {
  venueId: string;
  venueName: string;
  instructorId: string;
  instructorName: string;
  
  // Class info
  name: string;
  description: string;
  classType: string;              // 'kangoo_jumps', 'trampoline', 'pilates', 'yoga', 'crossfit', 'spinning'
  difficultyLevel: 'beginner' | 'intermediate' | 'advanced' | 'all_levels';
  
  // Details
  durationMinutes: number;
  maxParticipants: number;
  equipmentNeeded: string[];
  whatToBring: string[];
  
  // Pricing
  pricePerClass: number;
  pricePackage5: number | null;
  pricePackage10: number | null;
  priceMonthlyUnlimited: number | null;
  
  // Media
  coverImage: string;
  images: string[];
  
  // Virtual
  isVirtualAvailable: boolean;
  virtualPrice: number | null;
  
  // Flags
  isActive: boolean;
  isFeatured: boolean;
  
  createdAt: Timestamp;
}

// /fitnessClasses/{classId}/schedules/{scheduleId}
interface ClassSchedule {
  // Recurring schedule
  dayOfWeek: number;              // 0 = Sunday, 6 = Saturday
  startTime: string;              // "09:00"
  endTime: string;                // "10:00"
  room: string | null;
  
  // Or specific date (for one-time classes)
  specificDate: Timestamp | null;
  
  // Capacity
  maxParticipants: number;
  currentParticipants: number;
  waitlistCount: number;
  
  // Status
  isRecurring: boolean;
  isCancelled: boolean;
  cancellationReason: string | null;
  
  updatedAt: Timestamp;
}
```

### Events Collection
```typescript
// /events/{eventId}
interface Event {
  venueId: string;
  venueName: string;
  venueAddress: string;
  
  // Event info
  title: string;
  description: string;
  shortDescription: string;
  eventType: 'party' | 'vr_experience' | 'live_dj' | 'competition' | 'workshop' | 'corporate' | 'special';
  
  // Schedule
  startDatetime: Timestamp;
  endDatetime: Timestamp;
  doorsOpenAt: Timestamp | null;
  
  // Capacity
  maxCapacity: number;
  currentAttendees: number;
  waitlistEnabled: boolean;
  
  // Pricing
  price: number;
  vipPrice: number | null;
  earlyBirdPrice: number | null;
  earlyBirdUntil: Timestamp | null;
  groupPrice: number | null;      // Per person for groups
  groupMinSize: number | null;
  
  // Details
  includes: string[];             // ['drink', 'food', 'welcome_kit', 'parking']
  dressCode: string | null;
  ageRestriction: number | null;
  
  // Media
  coverImage: string;
  images: string[];
  videoUrl: string | null;
  
  // Restrictions
  isVipOnly: boolean;
  
  // Status
  status: 'draft' | 'published' | 'sold_out' | 'cancelled' | 'completed';
  
  // External
  externalTicketUrl: string | null;
  
  // Search
  searchKeywords: string[];
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Other Collections
```typescript
// /serviceCategories/{categoryId}
interface ServiceCategory {
  section: 'fit' | 'fun' | 'life';
  name: string;
  slug: string;
  description: string | null;
  icon: string;                   // Emoji or icon name
  displayOrder: number;
  parentId: string | null;
  isActive: boolean;
}

// /vipPlans/{planId}
interface VipPlan {
  name: string;
  type: 'monthly' | 'quarterly' | 'yearly';
  price: number;
  discountPercent: number;
  features: string[];
  stripePriceId: string;
  isPopular: boolean;
  isActive: boolean;
}

// /challenges/{challengeId}
interface Challenge {
  title: string;
  description: string;
  challengeType: 'streak' | 'total_classes' | 'try_new' | 'referral' | 'spend';
  targetValue: number;
  pointsReward: number;
  badgeImageUrl: string | null;
  startDate: Timestamp;
  endDate: Timestamp;
  participantCount: number;
  isActive: boolean;
}

// /promotions/{promotionId}
interface Promotion {
  code: string;
  title: string;
  description: string;
  discountType: 'percentage' | 'fixed_amount' | 'free_session';
  discountValue: number;
  minPurchase: number | null;
  maxDiscount: number | null;
  maxUses: number | null;
  currentUses: number;
  perUserLimit: number;
  applicableSections: ('fit' | 'fun' | 'life')[];
  applicableServiceIds: string[] | null;
  vipOnly: boolean;
  newUsersOnly: boolean;
  validFrom: Timestamp;
  validUntil: Timestamp;
  isActive: boolean;
}

// /streamingSchedule/{scheduleId}
interface StreamingSchedule {
  title: string;
  description: string;
  streamerName: string;
  twitchChannel: string;
  category: 'workout' | 'talk_show' | 'cooking' | 'gaming' | 'event';
  scheduledAt: Timestamp;
  durationMinutes: number;
  isLive: boolean;
  thumbnailUrl: string | null;
}
```

## Firestore Indexes

> **Note (audit sync 2026-05):** As of 2026-05, `firestore.indexes.json` is empty (only commented examples and empty `indexes`/`fieldOverrides` arrays). Composite indexes are currently auto-created from query patterns at runtime via the Firebase console error link. The block below is the **intended** index set and should be added to `firestore.indexes.json` before relying on it in production.
>
> **Update (P0-1, 2026-08-09):** `firestore.indexes.json` is no longer empty — it now holds
> 8 real `bookings` indexes, deployed. Note the failure mode this closed: a missing index
> makes the query throw, `providerStore` catches it into `bookingError`, and the UI renders
> an empty list or a bare "not found" with **nothing in the browser console**. If a booking
> list or detail page looks empty, check for a missing index before anything else.
>
> Deployed `bookings` indexes:
> - `instructorId` + `scheduledAt DESC` — the trainer's bookings list
> - `instructorId` + `status` + `scheduledAt DESC` — that list, filtered
> - `instructorId` + `userId` + `scheduledAt DESC` — a client's history with one trainer
> - `userId` + `scheduledAt DESC` — the client's own bookings
> - `status` + `scheduledAt` — `sendBookingReminders`
> - `status` + `scheduledEndAt` — `processCompletedBookings`
> - `status` + `completionReminderSentAt` + `scheduledEndAt` — `remindTrainerToComplete`
> - `status` + `paymentConfirmation.clientResponse` + `paymentConfirmation.confirmedByTrainerAt` — `autoConfirmPayments`

> **Update (business accounts and courses, reconciliation 2026-10-19):** `firestore.indexes.json` holds **72** indexes: the 53
> deployed to production on 2026-10-06, 6 for courses that production has never had (`courses` x2,
> `courseEnrollments`, `courseRefunds`, `sessions` collection-group x2; list in
> [deployment/staging.md](deployment/staging.md#1-indexes-first-and-wait-for-ready)), 6 for the unified courses model and 7 newest-first
> lists of enrollments and refunds. The three indexes of the removed partner-gym flow are gone from the file
> (see "Indexes for courses" below). Four of the 53 are `users` composites for
> the `/admin/providers` account-type filter: the four shapes the list already used, each with `providerKind` (derived by the
> admin-index trigger, `functions/src/users/adminIndex.ts`) before `providerVerification`/`createdAt DESC`. They must be READY
> before the filter is used (a missing index makes the list throw into an empty state); `scripts/verify-admin-list-indexes.mjs`
> checks every shape. There is **no** `providerType` index: that was main's superseded rebuild, and any `providerType` indexes on
> staging are orphans to delete there. `/fit/gyms` lists gym, school and studio venues with the existing `venues`
> (`type`, `geohash`) and (`type`, `rating`) indexes via `type in [...]`. `updateBusinessTaxId` queries
> `instructors where business.vatNumber ==` and the claim lookups `businessVat where uid ==`: both use automatic single-field
> indexes (do not exempt those fields). Never deploy indexes with `--force` on production.

Create these composite indexes in `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "venues",
      "fields": [
        { "fieldPath": "section", "order": "ASCENDING" },
        { "fieldPath": "isActive", "order": "ASCENDING" },
        { "fieldPath": "ratingAvg", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "venues",
      "fields": [
        { "fieldPath": "geohash", "order": "ASCENDING" },
        { "fieldPath": "isActive", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "bookings",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "scheduledAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "bookings",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "scheduledAt", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "events",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "startDatetime", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "instructors",
      "fields": [
        { "fieldPath": "isActive", "order": "ASCENDING" },
        { "fieldPath": "homeServiceAvailable", "order": "ASCENDING" },
        { "fieldPath": "ratingAvg", "order": "DESCENDING" }
      ]
    }
  ]
}
```

## Additional Collections (Audit Sync 2026-05)

The following top-level collections exist in `firestore.rules` and/or `functions/src/` but were not previously documented. Field shapes are derived from the rules and from `functions/src/types.ts` / `functions/src/users/roles.ts`. Where source is ambiguous, the entry is marked `Schema TBD — see firestore.rules`.

### userTypes
- **Path:** `/userTypes/{userTypeId}`
- **Purpose:** Catalog of provider categories (e.g. Personal Trainer, Yoga Instructor) with their services and requirements.
- **Key fields:** `id`, `name`, `slug`, `description`, `shortDescription`, `icon`, `category` (`'fitness' | 'wellness' | 'beauty' | 'mental_health' | 'education' | 'medical'`), `services: UserTypeService[]`, `requirements: UserTypeRequirements`, `isActive`, `displayOrder`, `tags?`, `createdAt`, `updatedAt`. See `UserTypeDefinition` in `functions/src/types.ts`.
- **Access:** Public read; admin write.

### serviceTypes
- **Path:** `/serviceTypes/{serviceTypeId}`
- **Purpose:** Service-offering catalog linking specific services to one or more `userTypes`.
- **Key fields:** `id`, `name`, `slug`, `description`, `applicableUserTypeIds: string[]`, `defaultDuration`, `durationOptions: number[]`, `pricingType: 'fixed' | 'hourly' | 'session'`, `requirements?`, `isActive`, `tags: string[]`, `createdAt`, `updatedAt`. See `ServiceType` in `functions/src/types.ts`.
- **Access:** Public read; admin write.

### providerApplications
- **Path:** `/providerApplications/{applicationId}`
- **Purpose:** Pending "apply to become a provider" submissions awaiting admin review.
- **Key fields:** `userId`, `userType`, `providerProfile`, `status: 'pending' | ...`, `submittedAt`, `reviewedAt: Timestamp | null`, `reviewedBy: string | null`, `notes: string | null`. (Written from `functions/src/users/roles.ts`.)
- **Access:** Read by the owner (`resource.data.userId == auth.uid`) or admin; create by the authenticated owner; update by admin; delete by superadmin.

### businessVat
- **Path:** `/businessVat/{vatNumber}` (docId == the normalized 11-digit tax id: P.IVA, or an association's codice fiscale)
- **Purpose:** Uniqueness claim so only one business account can register a given tax id. Written in a transaction together with the application; the same transaction releases every other claim the applicant holds (found by `uid`), so an account holds at most one. A rejection keeps the claim. Admin callables (B8): `releaseBusinessVat` deletes a claim that is no longer in use (refused while the holder's pending, approved or still-listed instructors doc carries the number), `convertBusinessToIndividual` deletes every claim of the uid, `updateBusinessTaxId` moves the claim to the new number (refused if another instructors doc still carries it). Invariant: one tax id, one holder — `decideProviderApplication` approves a company only while it holds the claim on its tax id (`claim_missing` / `vat_already_registered`). Deleting a user (`deleteUserCascade`) deletes the claims it held.
- **Key fields:** `uid` (owner of the claim; `applyAsProvider`, `convertBusinessToIndividual` and `updateBusinessTaxId` query `uid ==` inside their transactions, and `deleteUserCascade` outside one — automatic single-field index, do not exempt it), `createdAt: Timestamp`.
- **Access:** No client read or write (rules deny all); Admin SDK (Cloud Functions) only.

### venueStaff
- **Path:** `/venueStaff/{staffId}` (staffId == auth uid)
- **Purpose:** Maps a user to a venue for venue-scoped staff permissions (used by the `isVenueStaff(venueId)` rule helper).
- **Key fields:** `venueId` (verified from `firestore.rules`). Other fields Schema TBD — see firestore.rules.
- **Access:** Read by the staff user themselves or admin; write admin only.

### payments
- **Path:** `/payments/{paymentId}`
- **Purpose:** Payment records (created by Cloud Functions, typically from Stripe webhooks).
- **Key fields:** `userId` (verified from `firestore.rules`). Full payload Schema TBD — see firestore.rules / Stripe webhook handlers in `functions/src/payments/`.
- **Access:** Read by owner (`resource.data.userId == auth.uid`) or admin; create only via Cloud Functions; update by admin; delete by superadmin.

### stripeCustomers
- **Path:** `/stripeCustomers/{customerId}`
- **Purpose:** Maps Firebase users to their Stripe customer records (managed by Cloud Functions / Stripe Firebase extension).
- **Key fields:** `userId` (verified from `firestore.rules`). Other fields Schema TBD — see firestore.rules and the Stripe extension's documented shape.
- **Access:** Read by owner (`resource.data.userId == auth.uid`) or admin; write only via Cloud Functions.

### auditLogs
- **Path:** `/auditLogs/{logId}`
- **Purpose:** Generic admin audit trail for sensitive actions.
- **Key fields:** Schema TBD — see firestore.rules. (Rule allows reads only; writes restricted to Cloud Functions.)
- **Access:** Admin read; write only via Cloud Functions.

### roleChangeLogs
- **Path:** `/roleChangeLogs/{logId}`
- **Purpose:** Append-only log of user role changes performed via `setUserRole`.
- **Key fields:** `userId`, `previousRole`, `newRole`, `changedBy`, `reason: string | null`, `timestamp`. (From `functions/src/users/roles.ts`.)
- **Access:** Admin read; write only via Cloud Functions.

### verificationLogs
- **Path:** `/verificationLogs/{logId}`
- **Purpose:** Append-only log of provider verification (verify/unverify) actions.
- **Key fields:** `providerId`, `verified: boolean`, `verifiedBy`, `notes: string | null`, `timestamp`. (From `functions/src/users/roles.ts`.)
- **Access:** Admin read; write only via Cloud Functions.

### userStatusLogs
- **Path:** `/userStatusLogs/{logId}`
- **Purpose:** Append-only log of user activation/deactivation actions.
- **Key fields:** `userId`, `isActive: boolean`, `changedBy`, `reason: string | null`, `timestamp`. (From `functions/src/users/roles.ts`.)
- **Access:** Admin read; write only via Cloud Functions.

### deletedUsers
- **Path:** `/deletedUsers/{userId}`
- **Purpose:** Tombstone collection that triggers `onUserDeleted` cleanup (see `functions/src/auth/index.ts`).
- **Key fields:** Schema TBD — see firestore.rules and the `onUserDeleted` trigger.
- **Access:** Superadmin read/write.

### config
- **Path:** `/config/{configId}`
- **Purpose:** Application-level configuration documents readable/writable by admins.
- **Key fields:** Schema TBD — see firestore.rules.
- **Access:** Admin read; admin write.

### systemSettings
- **Path:** `/systemSettings/{settingId}`
- **Purpose:** Platform-wide system settings restricted to superadmins.
- **Key fields:** Schema TBD — see firestore.rules.
- **Access:** Superadmin read; superadmin write.

### notifications (global)
- **Path:** `/notifications/{notificationId}` (top-level, distinct from `/users/{userId}/notifications/{notificationId}`)
- **Purpose:** Global / broadcast notifications stream maintained by Cloud Functions; per-user delivery still lives under the user subcollection documented above.
- **Key fields:** Schema TBD — see firestore.rules. (Rule allows admin read only; writes restricted to Cloud Functions.)
- **Access:** Admin read; write only via Cloud Functions.

### analytics
- **Path:** `/analytics/{docId}`
- **Purpose:** Aggregated analytics documents written by scheduled / event-driven Cloud Functions.
- **Key fields:** Schema TBD — see firestore.rules.
- **Access:** Admin read; write only via Cloud Functions.

### admins (deprecated)
- **Path:** `/admins/{adminId}`
- **Purpose:** Legacy admin marker collection. **Deprecated** — the platform now derives admin status from `users/{userId}.role in ['admin', 'superadmin']`. Retained in `firestore.rules` for backwards compatibility only; do not write new code against this collection.
- **Key fields:** Schema TBD — see firestore.rules.
- **Access:** Admin read/write (legacy).

## Recipes (P2-6, 2026-08-09)

### recipes

- **Path:** `/recipes/{recipeId}` — **top level**, not under a client.
- **Purpose:** Generic AI-generated or manually authored recipe suggestions. Owned by whoever
  created them; shared with named clients by adding uids to `sharedWithUserIds`.

```typescript
// /recipes/{recipeId}
interface Recipe {
  title: string;
  servings: number;                  // 1–8
  prepMinutes: number;
  cookMinutes?: number;
  ingredients: { item: string; quantity: string }[];
  steps: string[];
  nutritionPerServing?: { kcal?: number; protein?: number; carbs?: number; fat?: number };
  tags: string[];

  // The enum selections that produced it — used for filtering and re-generation.
  params: {
    dietStyle: 'onnivora' | 'vegetariana' | 'vegana' | 'pescetariana';
    excludes: ('glutine' | 'lattosio' | 'frutta_secca' | 'uova' | 'crostacei' | 'soia')[];
    orientation: 'ricche_di_proteine' | 'piatti_leggeri' | 'piatto_unico' | 'colazione'
      | 'spuntino' | 'pre_allenamento' | 'post_allenamento';
    cuisine: 'italiana' | 'mediterranea' | 'asiatica' | 'mediorientale' | 'messicana' | 'qualsiasi';
    maxPrepMinutes: 15 | 30 | 45 | 60;
    budget: 'economico' | 'medio' | 'qualsiasi';
  };

  source: 'ai' | 'manual';
  model?: string;
  aiPromptSnapshot?: string;         // ≤ 20000 chars, audit trail
  screening?: { droppedCount: number };  // recipes discarded by output screening

  ownerUid: string;
  ownerRole: 'provider' | 'client' | 'admin';
  sharedWithUserIds: string[];       // auth uids; [] on create; max 50

  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### There is no `clientId` field, and that absence is the entire guardrail

Under Italian law only *medici*, *biologi nutrizionisti* and *dietisti* may prescribe a
personalized diet. A recipe cannot be "for Marco" because **the document has nowhere to record
Marco** — and the `generateRecipes` callable has no `clientId` parameter to put there either.
Do not add one, and do not add anything that reintroduces per-person prescription by another
name: there is no `targets`, no `kcalTarget`, no `durationDays` and no `days[]`, and the AI
output schema cannot express a day, a week or a meal sequence.

`sharedWithUserIds` is not a back door to that. It grants *read access* to a document whose
contents are generic by construction; it does not make the recipe about the reader.

`nutritionPerServing` is per portion — standard food labelling, which is permitted. Values are
surfaced in the UI as "valori indicativi per porzione", never as a target.

`ownerRole` is written by the Cloud Function from the caller's own role. Clients may own
recipes they generated for themselves, at a lower daily quota.

#### Access

Rules live in `firestore.rules` under `match /recipes/{recipeId}`:

- **get, list:** admin, the owner (`resource.data.ownerUid == request.auth.uid`), or a uid
  present in `resource.data.sharedWithUserIds`.
- **create:** authenticated, `ownerUid == request.auth.uid`, and `sharedWithUserIds` empty.
  (AI documents are written by the Cloud Function through the Admin SDK and bypass rules; this
  clause covers manual authoring from the client SDK.)
- **update:** admin, or the owner with `ownerUid` unchanged and `sharedWithUserIds.size() <= 50`.
  The cap stops the field being used as a broadcast channel.
- **delete:** admin or the owner.

**Accepted limitation:** an owner may share to any uid, not only to their own clients.
Verifying the relationship would cost a `get()` on every share write; the UI only offers the
trainer's own roster, and there is nothing personal in a generic recipe to leak.

#### Queries and indexes

Firestore evaluates `list` rules against the **query**, not the documents it would return, so
these query shapes are part of the security design, not an implementation detail:

| Screen | Query | Authorizing clause |
|---|---|---|
| `/provider/recipes` | `ownerUid == uid` + `orderBy createdAt desc` | owner |
| `/recipes` → "Consigliate dal tuo trainer" | `sharedWithUserIds array-contains uid` + `orderBy createdAt desc` | shared-with |
| `/recipes` → "Le mie ricette" | `ownerUid == uid` + `orderBy createdAt desc` | owner |
| Client detail → Recipes tab | `ownerUid == uid` **and** `sharedWithUserIds array-contains clientUserId` + `orderBy createdAt desc` | owner |

The last row is the trap. The obvious query — `sharedWithUserIds array-contains clientUserId`
alone — is denied **for everyone including the trainer**, because the array-contains value is
the *client's* uid while the rule tests the *caller's*. The `ownerUid == uid` constraint is
what makes the query provably safe, so it is mandatory rather than an optimization.

Deployed in `firestore.indexes.json`:

- `recipes`: `ownerUid` ASC, `createdAt` DESC
- `recipes`: `sharedWithUserIds` ARRAY_CONTAINS, `createdAt` DESC
- `recipes`: `ownerUid` ASC, `sharedWithUserIds` ARRAY_CONTAINS, `createdAt` DESC

### Removed collections (2026-08-09)

| Path | Fate |
|---|---|
| `clients/{clientId}/dietPlans` | **Removed.** Exported to `gs://<default-bucket>/legal-purge/nutrition-<ISO8601>.json`, then deleted by the `purgeLegacyNutritionData` callable. Rules block deleted, types deleted, `generateDietPlan` deleted and the deployed function removed with `firebase functions:delete` |
| `clients/{clientId}/recipes` | **Removed.** Same export-then-delete path. Superseded by the top-level `recipes` collection above |

**Reason:** a per-day meal plan with a `kcalTarget`, and a recipe stored under a named client
and generated from that client's goals and recent sessions, are personalized diets. Issuing one
is reserved by Italian law to *medici*, *biologi nutrizionisti* and *dietisti*, so a personal
trainer doing it commits *abuso di professione*.

The legacy per-client recipes were **not migrated** to the new collection: they were produced
with the client's goals in the prompt and macro targets in the params, which makes them exactly
the personalized artifacts this change exists to stop producing.

Production held **zero** documents in either subcollection at the time of the change (all four
`clients/*` documents had no subcollections). The purge callable exists so that anything created
between the decision and the deploy is caught, and so that the deletion is evidenced if it is
ever questioned.

Note for anyone touching `purgeLegacyNutritionData`: `db.collectionGroup("recipes")` matches
the new **top-level** `recipes` collection as well. The callable filters on
`path.startsWith("clients/")` for exactly that reason. Do not remove that guard.

## Chat (client ↔ trainer, 2026-09-29)

### conversations/{minUid}_{maxUid}

The id is deterministic (the two participant uids, sorted, joined by `_`), so every
"Message" button lands on the same thread and a pair never gets two conversations.

| Field | Type | Written by |
|---|---|---|
| `participantIds` | `[minUid, maxUid]` (sorted) | creator |
| `participants` | `{ [uid]: { name, photoUrl } }` | creator; each participant may refresh their own entry |
| `createdAt` | timestamp (`request.time`) | creator |
| `lastMessageAt` | timestamp — `createdAt` until the first message, then the last message's time | creator, then `onChatMessageCreated` |
| `lastMessage` | string (≤ 140 chars preview) | `onChatMessageCreated` |
| `lastSenderId` | uid | `onChatMessageCreated` |
| `unread` | `{ [uid]: number }` | `onChatMessageCreated` increments the recipient; a participant resets only their own to 0 |
| `lastPushAt` | `{ [uid]: timestamp }` — push throttle, ≤ 1 push / conversation / recipient / 5 min | `onChatMessageCreated` only |
| `bookingId` | string, optional — the booking the chat was opened from | creator |

Created by a participant in the same batch as its first message. A customer may only open a
conversation with a provider/staff user; providers and staff may open one with anyone.

**Unread is server-side**: the trigger increments `unread[recipient]` (admin SDK, one
`FieldValue.increment`), so the client never has to be trusted with the other side's counter
and the rules only need to allow "set my own count to 0".

### conversations/{id}/messages/{messageId}

`senderId` (must be the caller), `text` (1–2000 chars, not blank), `createdAt`
(`request.time`). Immutable for clients: no edits or deletes by anyone. The trigger stamps
`processedAt` (admin SDK) so a redelivered trigger neither double-counts nor re-notifies.

**Notifications** (`functions/src/chat/onMessageCreated.ts`, `onChatMessageCreated`): on each
message the other participant gets an in-app entry in `users/{uid}/notifications`
(`type: "chat_message"`, `data: { conversationId, senderId }`) and a push (skipped when their
`notificationSettings.push.chat` is false) — both at most once per conversation per recipient
per 5 minutes (`lastPushAt`). Every message still increments `unread`.

Index: `conversations` — `participantIds` ARRAY_CONTAINS, `lastMessageAt` DESC (the `/chat` inbox).

## Security Rules

See `firestore.rules` file for complete security rules implementation.

## Group course collections

One model for individual providers and venues (gym, school, studio). Every write below is made by a Cloud Function (Admin SDK); clients only read, as the last column says. Field types are in `functions/src/courses/store.ts` and `src/types/course.ts`. Behaviour: [features.md](features.md#group-courses-and-activities), [api/reference.md](api/reference.md#group-course-api).

| Collection | Responsibility | Client access |
|---|---|---|
| `courses/{id}` | Provider/service/category links, publication/eligibility, recurrence/timezone, prices in cents (0 = free), policies, next-session availability; venue fields below | Published eligible courses public; provider, admin and (venue courses) the venue's owner/active staff read, as do customers with history; no client writes |
| `courses/{id}/sessions/{dateId}` | One lesson (`dateId` = `YYYY-MM-DD`): UTC start/end, capacity, occupied/held/waitlisted counts, state, instructor/location text, and the snapshots below | Course audience read; the public timetable reads `listed` lessons through a collection-group query; no client writes |
| `courses/{id}/sessions/{dateId}/participants/{uid}` | Unique enrollment membership, private name, attendance, `noShow` | Customer/owner/staff/admin read; no client writes |
| `courses/{id}/sessions/{dateId}/waitlist/{uid}` | A customer waiting for the full lesson (below) | The entry's own customer, course managers; no client writes |
| `courses/{id}/customers/{uid}` | Persistent enrollment-history access to archived courses, and the customer's reliability counters `noShows` and `lateCancels` | Customer/owner/staff/admin read; no client writes |
| `courseEnrollments/{id}` | Request-id-derived identity, lesson/series selection, price allocations and quote snapshot, cancellation policy, active/cancelled session IDs, direct/Stripe payment, hold expiry, settlement/liability | Customer, provider, admin and (venue courses) venue managers read; no client writes |
| `courseRefunds/{enrollment_session}` | Eligible per-lesson refund amount, `courseId` and `venueId`, direct refund confirmation or Stripe refund identity/status | Customer, provider, admin and venue managers read; no client writes |
| `courseNotifications/{id_event_uid}` | Durable idempotent notification outbox | Server only |
| `courseScheduleLocks/{key}` | Room and instructor day locks (below) | Server only |
| `courseSweepState/waitlist` | Cursors of the waitlist sweep (below) | Server only |
| `venues/{v}/locations/{l}` | `name`, `address`, `city`, `timezone` (IANA), `isActive` | Public read; client writes denied, `saveGymSpace` (venue owner, active staff, admin) validates timezone and writes |
| `venues/{v}/locations/{l}/rooms/{r}` | `name`, `isActive` | As above |
| `venues/{v}/instructors/{i}` | An instructor linked to the venue: `isActive`, `name`, `photoUrl`; the partner status lives on `instructors/{i}.partnerStatus` | Public read; admin write (the callable `configureGymInstructor`, admin only, writes it together with the partner status) |
| `venueStaff/{uid}` | `{venueId, isActive}`: active staff of one venue | See [venueStaff](#venuestaff) |

Instructor services gain `kind: group` and `courseId` when linked to a course. Only server callables can create/edit/delete that linkage. Legacy services without `kind` remain individual. Public participant records are never embedded in course/session documents.

### Course fields added by the unified model

`courses/{id}` gains: `venueId` (null for an individual course), `locationId`, `roomId`, `instructorId` (all `string | null`), `waitlistEnabled` (default `true`) and, transiently, `listingSyncPending` (set by `onCourseProviderEligibility` while a multi-chunk pass is unfinished). For a venue-linked course the server owns `timezone` (the location's), `location` (`"<room> · <location>"`), `city` and `instructor` (the instructor's name); `providerId` is the venue owner unless an admin names another provider, and on edit it never changes. Prices may be `0` (free). `providerEligible` is denormalized as before.

`courses/{id}/sessions/{dateId}` gains (all absent on lessons written before the unified model, so readers default them):

| Field | Meaning |
|---|---|
| `courseId`, `venueId` | Denormalized so the collection-group timetable query and rules need no course read |
| `courseName`, `timezone` | The course's name and timezone, rewritten on every `saveCourse` (a rename or a location change), so venue pages can label and time lessons without reading course documents; older lessons lack them until `backfill-session-listed.mjs --names` |
| `locationId`, `roomId` | The lesson's own place (a rescheduled lesson may use another room than the course) |
| `instructorId`, `instructorName` | The lesson's instructor (a substituted lesson differs from the course) |
| `revision` | Starts at 1. Rises when the lesson's start/end/room/instructor changes, when its capacity changes, and for every scheduled lesson when the course's lesson price, series price, capacity, `cancellationHours` or `bookingNoticeHours` changes. A quote records it and `enrollInCourse` refuses a different one (`price_changed`, reason `availability`) |
| `listed` | `true` while the course is published and its provider eligible and the lesson is not cancelled; it is what the public timetable rule checks. `onCourseProviderEligibility` and the lifecycle (cancel, archive) keep it in step; `scripts/backfill-session-listed.mjs` repairs it |
| `waitlisted` | Number of waitlist entries; kept equal to the entries by join/leave/promotion/clear, and repaired by the sweep if it drifts |
| `capacity` | Per lesson. A course capacity change overwrites it; a lesson-level `capacity` action survives edits that leave the course capacity alone |
| `cancellationReconciled`, `cancellationReason`, `rescheduleReason` | Lesson cancellation/reschedule bookkeeping (cancellation reconciliation is retried by the maintenance job) |

`courses/{id}/sessions/{dateId}/waitlist/{uid}` (the document id is the customer's uid): `userId`, `customerName`, `scope: 'lesson'`, `requestId`, `paymentMode: 'direct' | 'stripe'`, `position` (contiguous from 1; later entries are renumbered when one leaves), `createdAt`, and `courseId`, `sessionId`, `courseName`, `providerId`, `venueId` so a customer's list needs no joins. Promotion books the entry with the same enrollment id a direct booking with that `requestId` would have, so a retried promotion replays instead of double-booking.

`courseEnrollments/{id}` gains the quote snapshot, all absent on older enrollments:

| Field | Meaning |
|---|---|
| `venueId` | The course's venue at booking time |
| `regularCents`, `discountCents` | Before and after-discount difference; `totalCents` is the amount due (sum of `allocations`) |
| `discountPercent`, `gymPercent`, `instructorPercent` | Informational (course-level instructor); the money fields are authoritative |
| `sessionRevisions` | `{ [sessionId]: revision }` of every booked lesson at booking time |
| `promotedFromWaitlist` | `true` when the booking came from the waitlist |
| `lateCancelledSessionIds` | Lessons staff removed this customer from after the customer's own cancellation deadline (no fee) |
| `allocations` | Per-lesson amounts **after** discount; refunds read them directly |

A zero `totalCents` is stored as `paymentMode: 'direct'`, `state: 'confirmed'`, `paymentStatus: 'paid'`, `paidCents: 0`, `paymentMethod: 'free'`. `courseRefunds` documents carry `courseId` and `venueId` (older ones lack `courseId`; `confirmCourseRefund` then reads it from the enrollment).

`participants/{uid}` gains `noShow` (set when attendance is marked `absent`). A removed participant's document is deleted, so late removals and no-shows are counted on `courses/{id}/customers/{uid}` (`noShows`, `lateCancels`, both `FieldValue.increment`) and, for late removals, on the enrollment.

### `courseScheduleLocks`

Server-only day locks that make room and instructor overlaps impossible, written in the same transaction as the course. Document ids are `room:<venueId>:<locationId>:<roomId>|<UTC day>` and `instructor:<instructorId>|<UTC day>` (ids contain only `[a-zA-Z0-9_-]`, so `:` and `|` cannot collide; a lesson that crosses UTC midnight takes two days per key). Shape: `{ day: 'YYYY-MM-DD', slots: { [`${courseId}_${sessionId}`]: { start: ms, end: ms, courseName } } }`. A course holds slots only while it is published, for lessons still scheduled that have not ended; unpublishing, archiving, cancelling a lesson or moving it releases them. Ended slots never block and are pruned when their document is rewritten, and by `sweepElapsedLocks` (every five minutes, queries `day <= today`). `courseName` is for the error message only.

### `courseSweepState/waitlist`

`{ cursor: path | null, entryCursor: path | null, updatedAt }`: where the previous waitlist sweep stopped, so lessons that legitimately keep a waitlist (full ones) do not starve the stranded ones behind them.

### Rules summary (`firestore.rules`)

- Course documents are readable when published and eligible, or by the provider, an admin, a venue manager (`managesVenue(venueId)`: admin, the venue's `ownerId`, or active `venueStaff`) for a venue-linked course, or a customer with history. Legacy courses without `venueId` stay with their provider. Enrollments and refunds add the same venue-manager clause on their `venueId` field, so venue queries (`where('venueId','==',v)`) are provable from their constraints.
- Public timetable: `match /{path=**}/sessions/{sessionId}` allows a read when `listed == true` and (`venueId == null` or the venue is an active partner of a hosting type, `activePartnerGym`). The client query must therefore constrain `venueId`, `listed`, `state`, `startsAt`. It reads the field directly, not with a default.
- Waitlist: a customer reads `collectionGroup('waitlist').where('userId','==',uid)`; managers and the entry's own customer read `courses/{c}/sessions/{s}/waitlist/{uid}`.
- `courseScheduleLocks`, `courseSweepState` and `courseNotifications` deny every client read and write. All course collections deny client writes.

### Indexes for courses

Added with the unified model (`firestore.indexes.json` holds 72; see the update note under Indexes): `courses` (`venueId`, `state`, `nextStartsAt`) and (`venueId`, `state`, `providerEligible`, `nextStartsAt`); `sessions` collection group (`venueId`, `listed`, `state`, `startsAt`), (`instructorId`, `listed`, `state`, `startsAt`) and (`state`, `waitlisted`); `waitlist` collection group (`userId`, `createdAt`). The existing ones stay: `courses` (`state`, `providerEligible`, `nextStartsAt`) and (`state`, `nextStartsAt`), `courseEnrollments` (`state`, `holdExpiresAt`), `courseRefunds` (`paymentMode`, `status`), `sessions` group (`state`, `cancellationReconciled`) and (`state`, `startsAt`). The waitlist sweep falls back to scanning scheduled lessons through (`state`, `startsAt`) while the (`state`, `waitlisted`) index is not READY.

Course publication denormalizes `providerEligible`; an instructor-write trigger (`onCourseProviderEligibility`) keeps it, and every lesson's `listed`, synchronized with verification/active/application status. Enrollment independently rechecks eligibility inside its transaction. A transaction reads all selected sessions and unique participant IDs before changing capacity. Cancellation uses unique session IDs and records history; historical sessions cannot be removed through schedule editing.

`systemSettings/payments.courseCheckoutEnabled` defaults false and is effective only alongside `stripePaymentsEnabled`. Enrollment defaults to direct payment. Escrow cannot be submitted. Course/session discovery, held-enrollment expiry, refund reconciliation, the venue timetable and the waitlist sweep depend on the indexes in `firestore.indexes.json`; deploy them (and wait for READY) before expecting production query behavior.

### Provider–participant relationships

`clients/{providerId_userId}` is the many-to-many provider/user join; existing legacy pair IDs are reused. Each record stores `providerId`, `userId`, contact display fields, visit/booking summaries, provider notes, and optional `accountStatus: invited|active`. Relationships have zero booking totals and null visit dates until relevant activity exists. Customer course bookings create a missing pair within the reservation transaction; provider-created reservations require an existing pair.

Clients cannot create root join records or change their `providerId`/`userId`. Providers can update descriptive fields on their own pair and delete it; customers can read their own pairs. Server account/roster callables own identity creation. Notes and other provider relationships remain independent.

`courseEnrollments.createdBy` records the actor; `userId` remains the participant. Provider-added enrollments use direct payment. `participantInvitationDeliveries` is a server-only audit containing provider/user/channel/status/timestamp, with no Auth setup credentials. Phone composer preparation is not a delivered-message audit. Invitation sending is scoped to a known provider/user pair and limited to 100 attempts per provider/hour.

Invited users keep a reserved Firebase Auth UID and `users.accountStatus: invited`. Verified account claiming activates that UID and the invited status on all related client pairs; existing enrollments keep their participant UID.

### Business account writes

Business account creation, conversion, tax-ID/legal-field changes and verification use server-side, audited callables. Admin and superadmin browser clients may read the legal fields and edit valid display fields, but cannot bypass the tax-ID claim or review checks. `businessVat` remains inaccessible to every browser client.

Further rules that bear on business documents (`firestore.rules`):

- **Frozen keys.** On `instructors/{uid}.business`, `legalName`, `vatNumber`, `legalForm`, `affiliationNumber`, `venueType`, `address` and `venueId` cannot be added, changed or removed by the owner or by an admin client (`businessReviewedKeys()`); the map accepts only the twelve keys of `businessKeys()`.
- **Name mirror (S-5).** An owner update that touches `name`, `fullName` or `business.displayName` must leave all three equal (`businessNameMirrorOk()`); an update that touches none of them passes, so a document already out of step is never locked out.
- **`socialLinks.*`** (`users` and `instructors`, `socialLinksUpdateOk()`): a changed key must be one of `instagram`, `facebook`, `twitter`, `linkedin`, `tiktok`, `website` and its value empty/null, an `http(s)://` URL or an `@handle`, at most 200 characters. The per-platform host allowlist (an `instagram` link must point at instagram.com) is applied when rendering, in `src/lib/socialLinks.ts` (`socialLinkHref`), not in the rules.
- **Venues** are public-read, created by an admin or venue staff, updated by an admin only (owners of a company venue edit it through the provider profile and the mirror trigger), deleted by a superadmin. `activePartnerGym` accepts the venue types in `COURSE_VENUE_TYPES` (gym, school, studio).

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
  type: 'gym' | 'wellness_center' | 'beauty_salon' | 'outdoor_space' | 'event_space';
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
  
  // Search
  searchKeywords: string[];
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

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

## Security Rules

See `firestore.rules` file for complete security rules implementation.

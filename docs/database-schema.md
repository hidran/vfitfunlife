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
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// /instructors/{instructorId}/availability/{dateId}
// dateId format: "2024-01-15"
interface InstructorAvailability {
  date: Timestamp;
  slots: {
    start: string;                // "09:00"
    end: string;                  // "10:00"
    isBooked: boolean;
    bookingId: string | null;
  }[];
  isAvailable: boolean;           // Quick flag for entire day
  updatedAt: Timestamp;
}
```

### Bookings Collection
```typescript
// /bookings/{bookingId}
interface Booking {
  // References
  userId: string;
  venueId: string;
  serviceId: string;
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
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  
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
  cancelledBy: 'user' | 'instructor' | 'venue' | 'admin' | null;
  cancellationReason: string | null;
  refundAmount: number | null;
  
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

## Security Rules

See `firestore.rules` file for complete security rules implementation.

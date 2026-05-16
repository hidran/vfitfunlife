# API Reference

## Table of Contents
- [Authentication](#authentication)
- [Cloud Functions](#cloud-functions)
- [Auth Functions](#auth-functions)
- [User Functions](#user-functions)
- [Profile APIs](#profile-apis)
- [Provider Functions](#provider-functions)
- [Booking Functions](#booking-functions)
- [Customer Booking APIs](#customer-booking-apis)
- [Provider Booking APIs](#provider-booking-apis)
- [Payment Functions](#payment-functions)
- [Admin Functions](#admin-functions)
- [Admin APIs](#admin-apis)
- [Error Handling](#error-handling)
- [Webhooks](#webhooks)
- [Address & Engagement](#address--engagement)
- [Role & User Management (additional)](#role--user-management-additional)
- [Demo Data Seeding](#demo-data-seeding)
- [Notifications](#notifications)
- [Scheduled Functions](#scheduled-functions)
- [Triggered Functions](#triggered-functions)

---

## Authentication

### Client-side Authentication

```typescript
import { auth } from '@/lib/firebase/config';
import { 
  GoogleAuthProvider, 
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword 
} from 'firebase/auth';

// Google OAuth
const provider = new GoogleAuthProvider();
const result = await signInWithPopup(auth, provider);

// Email/Password Login
await signInWithEmailAndPassword(auth, email, password);

// Email Registration
await createUserWithEmailAndPassword(auth, email, password);
```

### Auth State Observer

```typescript
import { onAuthStateChanged } from 'firebase/auth';

onAuthStateChanged(auth, (user) => {
  if (user) {
    // User is signed in
    console.log(user.uid, user.email);
  } else {
    // User is signed out
  }
});
```

---

## Cloud Functions

### Calling Functions

```typescript
import { functions } from '@/lib/firebase/config';
import { httpsCallable } from 'firebase/functions';

const functionName = httpsCallable<RequestType, ResponseType>(
  functions, 
  'functionName'
);

const result = await functionName({ /* params */ });
console.log(result.data);
```

---

## Auth Functions

### Initialize User Profile

Creates user profile after authentication.

```typescript
POST /initializeUserProfile

// Request (no body needed - uses auth context)
{}

// Response
{
  success: boolean;
  isNewUser: boolean;
  userId: string;
}
```

### Apply Referral Code

```typescript
POST /applyReferralCode

// Request
{
  referralCode: string;  // e.g., "VFIT2024"
}

// Response
{
  success: boolean;
  pointsEarned: number;  // 100 points for referrer and referee
}
```

**Error Codes:**
- `invalid-argument` - Invalid referral code format
- `not-found` - Referral code doesn't exist
- `already-exists` - User already applied a referral code

---

## User Functions

### Update Profile

```typescript
POST /updateProfile

// Request
{
  fullName?: string;
  dateOfBirth?: string;  // ISO date format
  phone?: string;
  avatarUrl?: string;
  preferredLanguage?: 'it' | 'en';
  notificationsEnabled?: boolean;
}

// Response
{
  success: boolean;
  updatedAt: string;
}
```

### Get User Stats

```typescript
POST /getUserStats

// Request (no body needed)
{}

// Response
{
  completedBookings: number;
  totalPointsEarned: number;
  totalPointsSpent: number;
  currentPointsBalance: number;
  reviewsWritten: number;
  activeChallenges: number;
  referralCount: number;
  memberSince: string;
}
```

### Set User Role

**Admin/Superadmin only**

```typescript
POST /setUserRole

// Request
{
  userId: string;
  role: 'customer' | 'provider' | 'admin' | 'superadmin';
}

// Response
{
  success: boolean;
}

// Error Codes
// - permission-denied: Not authorized to assign roles
// - invalid-argument: Invalid role specified
```

---

## Profile APIs

### Update Personal Information

> ⚠️ **Documented signature is partially out of date (audit 2026-05).** The actual exported `updateProfile` (see [`../../functions/src/users/index.ts`](../../functions/src/users/index.ts)) accepts a different set of fields. See [Update Profile](#update-profile) under User Functions for the canonical signature. The variant below documents an unimplemented superset.

```typescript
POST /updateProfile

// Request
{
  fullName?: string;
  bio?: string;
  dateOfBirth?: string;           // ISO date format
  phone?: string;
  email?: string;
  preferredLanguage?: 'it' | 'en';
}

// Response
{
  success: boolean;
  updatedAt: string;
  user: User;
}
```

### Update Avatar

> ⚠️ **Not currently exported (audit 2026-05).** This function is documented for historical reference; verify before relying on it.

```typescript
POST /updateAvatar

// Request - FormData
{
  file: File;                     // Image file (JPG, PNG, max 5MB)
}

// Response
{
  success: boolean;
  avatarUrl: string;              // New avatar URL
}

// Error Codes
// - invalid-argument: Invalid file type or size
// - resource-exhausted: Storage quota exceeded
```

### Update Social Links

> ⚠️ **Not currently exported (audit 2026-05).** This function is documented for historical reference; verify before relying on it.

```typescript
POST /updateSocialLinks

// Request
{
  instagram?: string;
  facebook?: string;
  linkedin?: string;
  website?: string;
  twitter?: string;
  youtube?: string;
}

// Response
{
  success: boolean;
  socialLinks: SocialLinks;
}
```

### Update Notification Settings

> ⚠️ **Not currently exported (audit 2026-05).** This function is documented for historical reference; verify before relying on it. The current `updateProfile` exposes a single `notificationsEnabled` boolean.

```typescript
POST /updateNotificationSettings

// Request
{
  email?: boolean;                // Email notifications
  push?: boolean;                 // Push notifications
  sms?: boolean;                  // SMS notifications
  marketing?: boolean;            // Marketing emails
  bookingReminders?: boolean;     // Booking reminder notifications
  promotionalOffers?: boolean;    // Promotional offers
  quietHoursStart?: string;       // "22:00"
  quietHoursEnd?: string;         // "08:00"
}

// Response
{
  success: boolean;
  settings: NotificationSettings;
}
```

### Update Privacy Settings

> ⚠️ **Not currently exported (audit 2026-05).** This function is documented for historical reference; verify before relying on it.

```typescript
POST /updatePrivacySettings

// Request
{
  profileVisible?: boolean;       // Show profile to public
  showContactInfo?: boolean;      // Show email/phone
  showBookingHistory?: boolean;   // Show booking history to providers
  allowSearchIndexing?: boolean;  // Allow search engines
}

// Response
{
  success: boolean;
  settings: PrivacySettings;
}
```

### Add Certification (Provider Only)

> ⚠️ **Not currently exported (audit 2026-05).** This function is documented for historical reference; verify before relying on it.

```typescript
POST /addCertification

// Request
{
  name: string;                   // Certification name
  issuingOrganization: string;    // Issuing organization
  issueDate: string;              // ISO date
  expiryDate?: string;            // ISO date (optional)
  documentFile?: File;            // PDF or image of certificate
}

// Response
{
  success: boolean;
  certification: {
    id: string;
    name: string;
    issuingOrganization: string;
    issueDate: string;
    expiryDate?: string;
    documentUrl?: string;
    verified: boolean;
    createdAt: string;
  };
}

// Error Codes
// - permission-denied: User is not a provider
```

### Remove Certification

> ⚠️ **Not currently exported (audit 2026-05).** This function is documented for historical reference; verify before relying on it.

```typescript
POST /removeCertification

// Request
{
  certificationId: string;
}

// Response
{
  success: boolean;
}
```

### Add Education Entry (Provider Only)

> ⚠️ **Not currently exported (audit 2026-05).** This function is documented for historical reference; verify before relying on it.

```typescript
POST /addEducation

// Request
{
  degree: string;                 // Degree/Certificate name
  institution: string;            // School/University name
  fieldOfStudy?: string;          // Field of study
  startYear: number;
  endYear?: number;               // Omit if ongoing
  isCurrent?: boolean;
}

// Response
{
  success: boolean;
  education: {
    id: string;
    degree: string;
    institution: string;
    fieldOfStudy?: string;
    startYear: number;
    endYear?: number;
    createdAt: string;
  };
}
```

### Update Availability (Provider Only)

> ⚠️ **Not currently exported (audit 2026-05).** This function is documented for historical reference; verify before relying on it.

```typescript
POST /updateAvailability

// Request
{
  schedule: {
    day: number;                  // 0-6 (Sunday-Saturday)
    start: string;                // "09:00"
    end: string;                  // "18:00"
    isAvailable: boolean;
    slots?: {                     // Specific time slots
      start: string;              // "09:00"
      end: string;                // "10:00"
      isBooked: boolean;
    }[];
  }[];
  exceptions?: {                  // Date exceptions
    date: string;                 // "2024-02-15"
    isAvailable: boolean;
    reason?: string;
  }[];
}

// Response
{
  success: boolean;
  updatedDays: number;
}
```

---

## Provider Functions

### Create Provider Profile

Behavior depends on caller role:
- **Customer** → submits a `providerApplications` record (status `"pending"`).
- **Admin / Superadmin** → creates the Firebase Auth user and provider account directly.

See [`../../functions/src/users/roles.ts`](../../functions/src/users/roles.ts).

```typescript
POST /createProviderProfile

// Request
{
  email: string;                // Required when staff creates
  fullName: string;             // Required when staff creates
  phone: string;
  userType: UserType;           // Enum value, NOT an ID. See listProviderTypes.
  providerProfile?: {
    bio?: string;
    specialties?: string[];
    yearsExperience?: number;
    certifications?: string[];
    languages?: string[];
    hourlyRate?: number;
    availabilitySchedule?: Record<string, unknown>;
    serviceArea?: {
      latitude: number;
      longitude: number;
      radiusKm: number;
    };
  };
  sendWelcomeEmail?: boolean;
}

// Response (staff create)
{
  success: true;
  userId: string;
  role: 'provider';
  message: string;
}

// Response (customer application)
{
  success: true;
  status: 'pending';
  message: string;
}
```

### Update Provider Profile

```typescript
POST /updateProviderProfile

// Request - all fields optional
{
  bio?: string;
  shortBio?: string;
  specialties?: string[];
  certifications?: string[];
  experienceYears?: number;
  languages?: string[];
  avatarUrl?: string;
  coverImage?: string;
  homeServiceAvailable?: boolean;
  homeServiceRadiusKm?: number;
  homeServiceFee?: number;
  acceptingNewClients?: boolean;
}

// Response
{
  success: boolean;
  updatedAt: string;
}
```

### Get Provider Profile

> ⚠️ **Not currently exported (audit 2026-05).** This function is documented for historical reference; verify before relying on it. Use `listProviders` or read the user document directly.

```typescript
POST /getProviderProfile

// Request
{
  providerId: string;
}

// Response
{
  id: string;
  userId: string;
  fullName: string;
  avatarUrl?: string;
  coverImage?: string;
  bio: string;
  shortBio: string;
  userType: {
    id: string;
    name: string;
    category: string;
  };
  specialties: string[];
  certifications: Certification[];
  education: Education[];
  experienceYears: number;
  languages: string[];
  ratingAvg: number;
  reviewCount: number;
  completedBookings: number;
  isVerified: boolean;
  services: ProviderService[];
  workingHours: WorkingHours[];
  homeServiceAvailable: boolean;
  homeServiceRadiusKm: number;
  portfolio?: {
    id: string;
    url: string;
    description?: string;
    createdAt: string;
  }[];
}
```

### List Providers

> ⚠️ **Documented filter set is broader than what is implemented (audit 2026-05).** The exported handler in [`../../functions/src/users/roles.ts`](../../functions/src/users/roles.ts) accepts only `userType`, `isVerified`, `limit`, `offset`. See the canonical signature under [Role & User Management (additional)](#role--user-management-additional). The richer search shape below is unimplemented.

```typescript
POST /listProviders

// Request - all fields optional
{
  userTypeId?: string;          // Filter by provider type
  category?: string;            // 'fitness' | 'wellness' | 'beauty' | 'mental_health' | 'education'
  location?: {
    latitude: number;
    longitude: number;
    radiusKm: number;
  };
  homeServiceOnly?: boolean;    // Filter for home service providers
  availableNow?: boolean;       // Filter by current availability
  minRating?: number;           // Minimum rating (1-5)
  maxPrice?: number;            // Maximum price
  sortBy?: 'rating' | 'distance' | 'bookings' | 'newest' | 'price_low' | 'price_high';
  limit?: number;               // Default: 20, Max: 100
  cursor?: string;              // For pagination
}

// Response
{
  providers: {
    id: string;
    fullName: string;
    avatarUrl?: string;
    shortBio: string;
    userTypeName: string;
    ratingAvg: number;
    reviewCount: number;
    startingPrice: number;
    homeServiceAvailable: boolean;
    distanceKm?: number;
    isVerified: boolean;
  }[];
  nextCursor?: string;
  totalCount: number;
}
```

### Add/Update Provider Service

> ⚠️ **Not currently exported (audit 2026-05).** This function is documented for historical reference; verify before relying on it.

```typescript
POST /updateProviderService

// Request
{
  serviceId?: string;           // Omit to create new
  name: string;
  description?: string;
  price: number;
  durationMinutes: number;
  isActive: boolean;
  maxBookingsPerDay?: number;
  requiresDeposit?: boolean;
  depositAmount?: number;
}

// Response
{
  serviceId: string;
  success: boolean;
}
```

### Set Provider Availability

> ⚠️ **Not currently exported (audit 2026-05).** This function is documented for historical reference; verify before relying on it.

```typescript
POST /setProviderAvailability

// Request
{
  date: string;                 // "2024-02-15" (YYYY-MM-DD)
  slots: {
    start: string;              // "09:00"
    end: string;                // "10:00"
    isAvailable: boolean;
  }[];
  isAvailable: boolean;         // Quick flag for entire day
}

// Response
{
  success: boolean;
  updatedSlots: number;
}
```

---

## Booking Functions

### Create Booking

```typescript
POST /createBooking

// Request
{
  providerId?: string;          // Required for direct provider bookings
  venueId?: string;             // Required for in-venue bookings
  serviceId: string;
  scheduledAt: string;          // ISO 8601 datetime
  bookingType: 'in_venue' | 'home_service' | 'virtual' | 'outdoor';
  
  // Required for home services
  serviceAddress?: {
    street: string;
    city: string;
    postalCode: string;
    latitude: number;
    longitude: number;
  };
  
  // Optional
  promotionCode?: string;
  usePoints?: boolean;          // Use points for discount
  customerNotes?: string;
}

// Response
{
  bookingId: string;
  finalPrice: number;
  depositAmount: number;
  pointsUsed: number;
  pointsEarned: number;
  status: 'pending_payment' | 'confirmed';
  expiresAt: string;            // Payment deadline
}

// Error Codes
// - not-found: Provider/service not found
// - failed-precondition: Time slot not available
// - invalid-argument: Outside service area (home service)
// - resource-exhausted: Maximum bookings reached
```

### Cancel Booking

```typescript
POST /cancelBooking

// Request
{
  bookingId: string;
  reason?: string;
  cancelledBy?: 'user' | 'provider';
}

// Response
{
  success: boolean;
  refundAmount: number;         // Based on cancellation policy
  refundPolicy: 'full' | 'partial' | 'none';
  pointsRefunded: number;
}
```

**Cancellation Policy:**
| Time Before Booking | Refund | Policy |
|---------------------|--------|--------|
| 24+ hours | 100% | Full refund |
| 12-24 hours | 50% | Partial refund |
| < 12 hours | 0% | No refund |

### Confirm Booking

```typescript
POST /confirmBooking

// Request
{
  bookingId: string;
}

// Response
{
  success: boolean;
  confirmedAt: string;
}

// Note: Provider only - confirms a pending booking request
```

### Complete Booking

> ⚠️ **Not currently exported as a standalone function (audit 2026-05).** Completion is handled by `updateBookingStatus` and by the scheduled `processCompletedBookings` job. This entry is kept for historical reference.

```typescript
POST /completeBooking

// Request
{
  bookingId: string;
  notes?: string;
}

// Response
{
  success: boolean;
  completedAt: string;
  earnings: number;             // Provider earnings
}

// Note: Provider only - marks booking as completed
```

### Reschedule Booking

> ⚠️ **Not currently exported (audit 2026-05).** This function is documented for historical reference; verify before relying on it.

```typescript
POST /rescheduleBooking

// Request
{
  bookingId: string;
  newScheduledAt: string;       // New date/time
  reason?: string;
}

// Response
{
  success: boolean;
  booking: Booking;
  priceDifference: number;      // Additional charge or refund
}
```

### Get Booking Details

> ⚠️ **Not currently exported under this name (audit 2026-05).** The canonical export is `getBooking` (see [`../../functions/src/bookings/index.ts`](../../functions/src/bookings/index.ts)). The response shape below is aspirational.

```typescript
POST /getBookingDetails

// Request
{
  bookingId: string;
}

// Response
{
  id: string;
  customer: {
    id: string;
    name: string;
    phone: string;
    avatarUrl?: string;
  };
  provider?: {
    id: string;
    name: string;
    phone: string;
    avatarUrl?: string;
  };
  venue?: {
    id: string;
    name: string;
    address: string;
  };
  service: {
    id: string;
    name: string;
    durationMinutes: number;
  };
  bookingType: string;
  serviceAddress?: {
    street: string;
    city: string;
  };
  scheduledAt: string;
  scheduledEndAt: string;
  status: string;
  paymentStatus: string;
  pricing: {
    originalPrice: number;
    finalPrice: number;
    depositAmount: number;
    depositPaid: boolean;
    pointsUsed: number;
    pointsValue: number;
  };
  qrCode?: string;              // For check-in
  canCancel: boolean;
  cancellationDeadline?: string;
  customerNotes?: string;
  providerNotes?: string;
}
```

### List Bookings

Exported as `listBookings` (not `listUserBookings`). Role-aware:
- Customers receive only their own bookings.
- Providers receive their own bookings or, when `asProvider: true`, bookings assigned to them.
- Admins / superadmins receive all bookings.

See [`../../functions/src/bookings/index.ts`](../../functions/src/bookings/index.ts).

```typescript
POST /listBookings

// Request
{
  status?: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  asProvider?: boolean;         // Providers only - list bookings assigned to me
  limit?: number;               // Default 20
  offset?: number;              // Default 0
}

// Response
{
  bookings: Array<{ bookingId: string; [key: string]: unknown }>;
  pagination: {
    limit: number;
    offset: number;
    count: number;
    hasMore: boolean;
  };
}
```

---

## Customer Booking APIs

### Search Providers

> ⚠️ **Not currently exported (audit 2026-05).** This function is documented for historical reference; verify before relying on it. Use `listProviders` for the implemented (more limited) provider listing.

```typescript
POST /searchProviders

// Request
{
  query?: string;               // Search query
  category?: string;            // Filter by category
  location?: {
    latitude: number;
    longitude: number;
    radiusKm: number;           // Search radius
  };
  date?: string;                // Check availability for specific date
  minRating?: number;
  maxPrice?: number;
  homeServiceOnly?: boolean;
  availableNow?: boolean;
  sortBy?: 'relevance' | 'rating' | 'distance' | 'price' | 'bookings';
  limit?: number;
  offset?: number;
}

// Response
{
  providers: {
    id: string;
    fullName: string;
    avatarUrl?: string;
    shortBio: string;
    userType: {
      id: string;
      name: string;
    };
    ratingAvg: number;
    reviewCount: number;
    startingPrice: number;
    distanceKm?: number;
    isVerified: boolean;
    isAvailable: boolean;       // For requested date
  }[];
  totalCount: number;
  hasMore: boolean;
}
```

### Get Provider Availability

> ⚠️ **Not currently exported (audit 2026-05).** This function is documented for historical reference; verify before relying on it.

```typescript
POST /getProviderAvailability

// Request
{
  providerId: string;
  date: string;                 // "2024-02-15"
  serviceId?: string;           // Check availability for specific service
}

// Response
{
  date: string;
  isAvailable: boolean;
  slots: {
    start: string;              // "09:00"
    end: string;                // "10:00"
    isAvailable: boolean;
    serviceId?: string;
  }[];
  workingHours: {
    start: string;
    end: string;
  };
}
```

### Create Booking

```typescript
POST /createBooking

// Request
{
  providerId?: string;
  venueId?: string;
  serviceId: string;
  scheduledAt: string;
  bookingType: 'in_venue' | 'home_service' | 'virtual' | 'outdoor';
  serviceAddress?: Address;
  promotionCode?: string;
  usePoints?: boolean;
  customerNotes?: string;
}

// Response
{
  bookingId: string;
  status: 'pending' | 'confirmed';
  finalPrice: number;
  depositAmount: number;
  paymentUrl?: string;          // If payment required
  expiresAt: string;            // Booking hold expiration
}
```

### Get User Bookings

> ⚠️ **Not currently exported (audit 2026-05).** Use `listBookings` (no `asProvider` flag) for the equivalent customer view. This entry remains for historical reference.

```typescript
POST /getUserBookings

// Request
{
  status?: BookingStatus[];
  fromDate?: string;
  toDate?: string;
  limit?: number;
  cursor?: string;
}

// Response
{
  bookings: BookingSummary[];
  nextCursor?: string;
  totalCount: number;
}
```

### Cancel Booking (customer variant)

> ⚠️ **This alternate signature is not currently exported (audit 2026-05).** See the canonical [Cancel Booking](#cancel-booking) under Booking Functions for the implemented signature.

```typescript
POST /cancelBooking

// Request
{
  bookingId: string;
  reason: string;
  requestRefund?: boolean;
}

// Response
{
  success: boolean;
  refundAmount: number;
  refundPolicy: 'full' | 'partial' | 'none';
  refundDays: number;           // Days until refund processed
}
```

### Reschedule Booking (customer variant)

> ⚠️ **Not currently exported (audit 2026-05).** This function is documented for historical reference; verify before relying on it.

```typescript
POST /rescheduleBooking

// Request
{
  bookingId: string;
  newDate: string;              // New scheduled date/time
  reason?: string;
}

// Response
{
  success: boolean;
  booking: Booking;
  priceAdjustment: number;      // Positive = charge more, negative = refund
}
```

---

## Provider Booking APIs

> ⚠️ **Audit 2026-05:** None of the functions in this section (`getProviderBookings`, the provider-side `confirmBooking`/`completeBooking` variants, `getProviderSchedule`, `rejectBooking`) are currently exported. Provider workflows are handled today through `listBookings` (with `asProvider: true`), `updateBookingStatus`, and `cancelBooking`. Sections kept for historical reference.

### Get Provider Bookings

```typescript
POST /getProviderBookings

// Request
{
  filters?: {
    status?: BookingStatus[];
    fromDate?: string;
    toDate?: string;
    customerId?: string;
  };
  limit?: number;
  cursor?: string;
}

// Response
{
  bookings: {
    id: string;
    customerName: string;
    customerPhone: string;
    customerAvatar?: string;
    serviceName: string;
    scheduledAt: string;
    durationMinutes: number;
    status: BookingStatus;
    finalPrice: number;
    isNewCustomer: boolean;
    customerNotes?: string;
  }[];
  nextCursor?: string;
  totalCount: number;
  summary: {
    pending: number;
    confirmed: number;
    completed: number;
    totalRevenue: number;
  };
}
```

### Confirm Booking

```typescript
POST /confirmBooking

// Request
{
  bookingId: string;
  notes?: string;
}

// Response
{
  success: boolean;
  confirmedAt: string;
  customerNotificationSent: boolean;
}
```

### Complete Booking

```typescript
POST /completeBooking

// Request
{
  bookingId: string;
  notes?: string;
  addToPortfolio?: boolean;     // Add photos to portfolio
}

// Response
{
  success: boolean;
  completedAt: string;
  earnings: number;
  platformFee: number;
  netEarnings: number;
}
```

### Get Provider Schedule

```typescript
POST /getProviderSchedule

// Request
{
  startDate: string;            // Start of date range
  endDate: string;              // End of date range
}

// Response
{
  schedule: {
    date: string;
    bookings: {
      id: string;
      customerName: string;
      serviceName: string;
      startTime: string;
      endTime: string;
      status: BookingStatus;
    }[];
    availableSlots: {
      start: string;
      end: string;
    }[];
    isFullyBooked: boolean;
  }[];
}
```

### Reject Booking

```typescript
POST /rejectBooking

// Request
{
  bookingId: string;
  reason: string;
  suggestAlternative?: {
    date: string;
    time: string;
  };
}

// Response
{
  success: boolean;
  rejectedAt: string;
  refundIssued: boolean;
  customerNotificationSent: boolean;
}
```

---

## Payment Functions

### Create Stripe Customer

```typescript
POST /createStripeCustomer

// Request (no body)
{}

// Response
{
  customerId: string;           // Stripe customer ID
}
```

### Create Payment Intent

See [`../../functions/src/payments/index.ts`](../../functions/src/payments/index.ts).

```typescript
POST /createPaymentIntent

// Request
{
  bookingId: string;
  isDeposit: boolean;           // Pay deposit only vs full amount
}

// Response
{
  clientSecret: string;         // For Stripe.js
  paymentIntentId: string;
}
```

### Create VIP Subscription

See [`../../functions/src/payments/index.ts`](../../functions/src/payments/index.ts). The plan ID must match a document in the `vipPlans` collection that exposes a `stripePriceId`.

```typescript
POST /createVipSubscription

// Request
{
  planId: string;               // Document ID in `vipPlans` collection
}

// Response
{
  subscriptionId: string;
  clientSecret: string;         // From latest_invoice.payment_intent, for 3D Secure
}
```

### Add Wallet Funds

```typescript
POST /addWalletFunds

// Request
{
  amount: number;               // €10-500
}

// Response
{
  clientSecret: string;
  paymentIntentId: string;
}
```

---

## Admin Functions

### Create User Type

> ⚠️ **Not currently exported (audit 2026-05).** User types are created via the `seedUserTypes` callable and edited with `updateUserType` (see [`../../functions/src/users/userTypes.ts`](../../functions/src/users/userTypes.ts)).

```typescript
POST /admin/createUserType

// Request
{
  name: string;
  category: string;
  slug: string;
  description?: string;
  icon?: string;
  requirements?: string[];
  defaultServices?: {
    name: string;
    durationMinutes: number;
    basePrice: number;
  }[];
}

// Response
{
  userTypeId: string;
  success: boolean;
}

// Requires: admin or superadmin role
```

### Verify Provider

```typescript
POST /admin/verifyProvider

// Request
{
  providerId: string;
  status: 'approved' | 'rejected';
  notes?: string;
  verifiedCertifications?: string[];  // IDs of verified certs
}

// Response
{
  success: boolean;
  verifiedAt: string;
}

// Requires: admin or superadmin role
```

---

## Admin APIs

> ⚠️ **Audit 2026-05:** The `/admin/*`-prefixed handlers below (`getDashboardStats`, `getUsers`, `updateUserRole`, `suspendUser`, `getBookings`, `processRefund`, `updatePlatformSettings`, `getSystemLogs`) are **not currently exported as cloud functions**. Equivalent functionality is provided today by the callables documented under [Role & User Management (additional)](#role--user-management-additional) (`listUsers`, `setUserActiveStatus`, `setUserRole`) and via direct Firestore reads. Sections kept for historical reference.

### Get Dashboard Stats

```typescript
POST /admin/getDashboardStats

// Request (no body required)
{}

// Response
{
  overview: {
    totalUsers: number;
    activeUsers: number;          // Active in last 30 days
    totalProviders: number;
    verifiedProviders: number;
    pendingVerifications: number;
  };
  bookings: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    total: number;
    completionRate: number;
    cancellationRate: number;
  };
  revenue: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    total: number;
    platformCommission: number;
  };
  charts: {
    userGrowth: { date: string; count: number }[];
    bookingTrends: { date: string; count: number }[];
    revenueTrends: { date: string; amount: number }[];
  };
  recentActivity: {
    id: string;
    type: 'booking' | 'registration' | 'verification' | 'review';
    description: string;
    timestamp: string;
    userId?: string;
    userName?: string;
  }[];
}

// Requires: admin or superadmin role
```

### Get Users

```typescript
POST /admin/getUsers

// Request
{
  filters?: {
    role?: ('customer' | 'provider' | 'admin' | 'superadmin')[];
    status?: ('active' | 'suspended' | 'pending')[];
    search?: string;              // Search by name/email
    verified?: boolean;
    dateFrom?: string;
    dateTo?: string;
  };
  sort?: {
    field: 'createdAt' | 'lastLogin' | 'name' | 'bookings';
    direction: 'asc' | 'desc';
  };
  pagination?: {
    limit: number;
    cursor?: string;
  };
}

// Response
{
  users: {
    id: string;
    fullName: string;
    email: string;
    phone?: string;
    role: string;
    status: string;
    isVerified: boolean;
    createdAt: string;
    lastLoginAt?: string;
    bookingCount: number;
    avatarUrl?: string;
  }[];
  nextCursor?: string;
  totalCount: number;
}

// Requires: admin or superadmin role
```

### Update User Role

```typescript
POST /admin/updateUserRole

// Request
{
  userId: string;
  role: 'customer' | 'provider' | 'admin' | 'superadmin';
  reason?: string;
}

// Response
{
  success: boolean;
  previousRole: string;
  newRole: string;
  updatedAt: string;
}

// Requires: superadmin role (for admin/superadmin assignments)
// Requires: admin role (for customer/provider changes)
```

### Suspend User

```typescript
POST /admin/suspendUser

// Request
{
  userId: string;
  reason: string;
  duration?: 'temporary' | 'permanent';
  restoreDate?: string;         // If temporary
  notifyUser?: boolean;
}

// Response
{
  success: boolean;
  suspendedAt: string;
  status: 'suspended';
}

// Requires: admin or superadmin role
```

### Verify Provider

```typescript
POST /admin/verifyProvider

// Request
{
  providerId: string;
  status: 'approved' | 'rejected' | 'pending';
  notes?: string;
  verifiedDocuments?: string[];
  rejectionReason?: string;
}

// Response
{
  success: boolean;
  status: string;
  verifiedAt?: string;
  verifiedBy?: string;
}

// Requires: admin or superadmin role
```

### Get Bookings

```typescript
POST /admin/getBookings

// Request
{
  filters?: {
    status?: BookingStatus[];
    fromDate?: string;
    toDate?: string;
    customerId?: string;
    providerId?: string;
    venueId?: string;
    minAmount?: number;
    maxAmount?: number;
  };
  sort?: {
    field: 'scheduledAt' | 'createdAt' | 'amount' | 'status';
    direction: 'asc' | 'desc';
  };
  pagination?: {
    limit: number;
    cursor?: string;
  };
}

// Response
{
  bookings: {
    id: string;
    customerName: string;
    customerId: string;
    providerName?: string;
    providerId?: string;
    venueName?: string;
    serviceName: string;
    scheduledAt: string;
    status: BookingStatus;
    finalPrice: number;
    paymentStatus: string;
    createdAt: string;
  }[];
  nextCursor?: string;
  totalCount: number;
  summary: {
    totalRevenue: number;
    totalBookings: number;
    byStatus: Record<BookingStatus, number>;
  };
}

// Requires: admin or superadmin role
```

### Process Refund

```typescript
POST /admin/processRefund

// Request
{
  bookingId: string;
  amount: number;               // Partial or full amount
  reason: string;
  notifyCustomer?: boolean;
  notifyProvider?: boolean;
}

// Response
{
  success: boolean;
  refundId: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  estimatedArrival?: string;
}

// Requires: admin or superadmin role
```

### Update Platform Settings

```typescript
POST /admin/updatePlatformSettings

// Request
{
  settings: {
    platformName?: string;
    supportEmail?: string;
    supportPhone?: string;
    commissionRate?: number;      // Platform commission percentage
    depositPercentage?: number;   // Required deposit percentage
    cancellationPolicy?: {
      fullRefundHours: number;    // Hours before booking for full refund
      partialRefundHours: number;
      partialRefundPercentage: number;
    };
    bookingSettings?: {
      minAdvanceBooking: number;  // Minutes
      maxAdvanceBooking: number;  // Days
      defaultBufferMinutes: number;
    };
    featureFlags?: {
      enableHomeService: boolean;
      enableVirtual: boolean;
      enableSubscriptions: boolean;
    };
  };
}

// Response
{
  success: boolean;
  updatedAt: string;
  settings: PlatformSettings;
}

// Requires: superadmin role
```

### Get System Logs

```typescript
POST /admin/getSystemLogs

// Request
{
  filters?: {
    action?: string[];
    userId?: string;
    fromDate?: string;
    toDate?: string;
    severity?: ('info' | 'warning' | 'error')[];
  };
  pagination?: {
    limit: number;
    cursor?: string;
  };
}

// Response
{
  logs: {
    id: string;
    action: string;
    userId?: string;
    userName?: string;
    details: Record<string, any>;
    severity: 'info' | 'warning' | 'error';
    ipAddress?: string;
    timestamp: string;
  }[];
  nextCursor?: string;
  totalCount: number;
}

// Requires: superadmin role
```

---

## Error Handling

All Cloud Functions return standardized errors:

```typescript
interface HttpsError {
  code: 
    | 'ok'
    | 'cancelled' 
    | 'unknown'
    | 'invalid-argument'
    | 'deadline-exceeded'
    | 'not-found'
    | 'already-exists'
    | 'permission-denied'
    | 'resource-exhausted'
    | 'failed-precondition'
    | 'aborted'
    | 'out-of-range'
    | 'unimplemented'
    | 'internal'
    | 'unavailable'
    | 'data-loss'
    | 'unauthenticated';
  message: string;
  details?: any;
}
```

### Common Error Scenarios

| Error Code | Scenario | Resolution |
|------------|----------|------------|
| `unauthenticated` | User not logged in | Redirect to login |
| `permission-denied` | Insufficient role | Show access denied |
| `not-found` | Resource doesn't exist | Show 404 page |
| `already-exists` | Duplicate operation | Show warning message |
| `failed-precondition` | Invalid state (e.g., slot taken) | Retry or select alternative |
| `invalid-argument` | Missing/invalid parameters | Fix form validation |
| `resource-exhausted` | Rate limit or quota exceeded | Wait and retry |
| `out-of-range` | Pagination cursor invalid | Reset to first page |

---

## Webhooks

### Stripe Webhooks

Endpoint: `POST /stripeWebhook`

Events handled:
- `payment_intent.succeeded` - Update booking payment status
- `payment_intent.payment_failed` - Notify user of failed payment
- `customer.subscription.created` - Activate VIP status
- `customer.subscription.deleted` - Deactivate VIP status
- `invoice.payment_succeeded` - Renew VIP subscription
- `charge.refunded` - Process refund completion

```typescript
// Webhook payload structure
{
  id: string;
  object: 'event';
  type: string;
  data: {
    object: any;
  };
}
```

**Security:** Stripe signature verified using webhook secret.

### Internal Webhooks

> ⚠️ **Audit 2026-05:** The HTTP `/webhooks/*` endpoints below are not currently exported. The equivalent work is performed by the Firestore triggers documented in [Triggered Functions](#triggered-functions) (`onBookingStatusChange`, `onUserDeleted`). Sections kept for historical reference.

#### Booking Status Changed

```typescript
POST /webhooks/bookingStatusChanged

// Payload
{
  bookingId: string;
  previousStatus: BookingStatus;
  newStatus: BookingStatus;
  changedBy: 'customer' | 'provider' | 'system' | 'admin';
  timestamp: string;
}
```

Triggers:
- Push notifications
- Email notifications
- SMS notifications (if enabled)
- Calendar updates

#### Provider Verified

```typescript
POST /webhooks/providerVerified

// Payload
{
  providerId: string;
  status: 'approved' | 'rejected';
  verifiedBy: string;
  timestamp: string;
}
```

Triggers:
- Provider notification
- Profile update
- Search index update

---

## Address & Engagement

Implemented in [`../../functions/src/users/index.ts`](../../functions/src/users/index.ts).

### Save Address

Adds a new address or updates an existing one. Exported as `saveAddress` (also referred to as `addAddress` in the audit).

```typescript
POST /saveAddress

// Request
{
  addressId?: string;           // Omit to create new
  address: {
    label: string;
    street: string;
    streetNumber: string;
    city: string;
    postalCode: string;
    province: string;
    country?: string;           // Defaults to "Italia"
    latitude: number;
    longitude: number;
    geohash: string;
    isDefault?: boolean;
  };
}

// Response
{
  addressId: string;
}
```

### Delete Address

```typescript
POST /deleteAddress

// Request
{
  addressId: string;
}

// Response
{
  success: true;
}
```

### Get Leaderboard

Public (no auth required).

```typescript
POST /getLeaderboard

// Request
{
  type?: 'points' | 'bookings'; // Default: 'points'
  limit?: number;               // Default: 10
}

// Response
{
  leaderboard: Array<{
    rank: number;
    userId: string;
    fullName: string;
    avatarUrl?: string;
    value: number;
    isVip: boolean;
  }>;
}
```

### Submit Review

Awards 50 bonus points and updates aggregated venue/instructor ratings.

```typescript
POST /submitReview

// Request
{
  bookingId: string;
  rating: number;               // 1-5
  comment?: string;
  images?: string[];
}

// Response
{
  reviewId: string;
  pointsEarned: number;         // 50
}
```

---

## Role & User Management (additional)

Implemented in [`../../functions/src/users/roles.ts`](../../functions/src/users/roles.ts).

### Get User Permissions

Returns the authenticated user's role, permissions, and admin flags.

```typescript
POST /getUserPermissions

// Request (uses auth context)
{}

// Response
{
  userId: string;
  role: 'customer' | 'provider' | 'admin' | 'superadmin';
  permissions: string[];
  isActive: boolean;
  userType: string | null;
  isProvider: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  canAccessAdminPanel: boolean;
}
```

### List Providers (implemented)

Public for verified providers; staff see all.

```typescript
POST /listProviders

// Request
{
  userType?: UserType;
  isVerified?: boolean;         // Staff-only filter
  limit?: number;               // Default 20
  offset?: number;              // Default 0
}

// Response
{
  providers: Array<{
    uid: string;
    fullName: string;
    email: string;
    phone: string;
    userType: string;
    providerProfile: {
      bio: string;
      specialties: string[];
      yearsExperience: number;
      languages: string[];
      isVerified: boolean;
      rating: number;
      reviewCount: number;
      hourlyRate?: number;
    };
    avatarUrl?: string;
    createdAt: Timestamp;
    // Staff-only:
    isActive?: boolean;
    isVerified?: boolean;
    walletBalance?: number;
  }>;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}
```

### List Provider Types

Public. Returns the static enum of provider categories with localized labels.

```typescript
POST /listProviderTypes

// Request
{}

// Response
{
  types: Array<{
    value: string;              // e.g. "trainer", "yoga_teacher"
    label: string;
    labelIt: string;
  }>;
}
```

### List Users

Admin / superadmin only.

```typescript
POST /listUsers

// Request
{
  role?: 'customer' | 'provider' | 'admin' | 'superadmin';
  limit?: number;               // Default 50
  offset?: number;              // Default 0
}

// Response
{
  users: Array<{
    uid: string;
    email: string;
    fullName: string;
    phone: string;
    role: string;
    userType?: string;
    isActive: boolean;
    isVerified: boolean;
    isVip: boolean;
    createdAt: Timestamp;
    lastLoginAt?: Timestamp;
  }>;
}
```

### Set User Active Status

Admin / superadmin only. Superadmin accounts are protected from non-superadmin callers.

```typescript
POST /setUserActiveStatus

// Request
{
  userId: string;
  isActive: boolean;
  reason?: string;
}

// Response
{
  success: true;
  userId: string;
  isActive: boolean;
  message: string;
}
```

---

## Demo Data Seeding

Functions for populating Firestore with demo data. See [`../backend/seeding.md`](../backend/seeding.md) for full request/response payloads, role gating, and operational notes.

| Function | Type | Auth | Source |
|---|---|---|---|
| `seedUserTypes` | Callable (`onCall`) | Admin/Superadmin | [`../../functions/src/users/userTypes.ts`](../../functions/src/users/userTypes.ts) |
| `seedAllData` | HTTP (`onRequest`, POST) | Bearer ID token + Admin/Superadmin | [`../../functions/src/seed/seedData.ts`](../../functions/src/seed/seedData.ts) |
| `seedQuickData` | HTTP (`onRequest`, POST) | Bearer ID token + Admin/Superadmin | [`../../functions/src/seed/seedData.ts`](../../functions/src/seed/seedData.ts) |
| `clearAllData` | HTTP (`onRequest`, POST) | Bearer ID token + Superadmin | [`../../functions/src/seed/seedData.ts`](../../functions/src/seed/seedData.ts) |

---

## Notifications

Implemented in [`../../functions/src/notifications/index.ts`](../../functions/src/notifications/index.ts).

### Register FCM Token

Stores up to the 5 most recent tokens for the user.

```typescript
POST /registerFcmToken

// Request
{
  token: string;
  platform: string;             // e.g. "ios", "android", "web"
}

// Response
{
  success: true;
}
```

### Mark Notification Read

```typescript
POST /markNotificationRead

// Request
{
  notificationId: string;
}

// Response
{
  success: true;
}
```

### Mark All Notifications Read

```typescript
POST /markAllNotificationsRead

// Request (uses auth context)
{}

// Response
{
  markedCount: number;
}
```

### Send VIP Notification

Broadcasts a push notification to every VIP user with notifications enabled and stores an in-app copy.

```typescript
POST /sendVipNotification

// Request
{
  title: string;
  body: string;
  imageUrl?: string;
}

// Response
{
  sentTo: number;               // Count of VIP recipients
}
```

---

## Scheduled Functions

Cloud Scheduler jobs implemented in [`../../functions/src/scheduled/index.ts`](../../functions/src/scheduled/index.ts). All run in `Europe/Rome`.

| Function | Schedule (cron) | Purpose |
|---|---|---|
| `sendBookingReminders` | `0 * * * *` (hourly) | Sends 24h and 2h push reminders for confirmed bookings. |
| `processCompletedBookings` | `*/30 * * * *` (every 30 min) | Marks past confirmed bookings as `completed` and awards points. |
| `expireVipSubscriptions` | `0 0 * * *` (daily, midnight) | Flips expired VIP users back to non-VIP and notifies them. |
| `expirePromotions` | `0 1 * * *` (daily, 01:00) | Deactivates promotions whose `validUntil` has passed. |
| `aggregateDailyStats` | `0 2 * * *` (daily, 02:00) | Writes yesterday's user/booking/revenue counters to `dailyStats/{date}`. |
| `cleanupOldNotifications` | `0 3 * * 0` (weekly, Sunday 03:00) | Deletes read in-app notifications older than 30 days. |
| `updateChallengeProgress` | Firestore trigger (`onDocumentUpdated bookings/{bookingId}`) | Despite living in `scheduled/`, this is a Firestore trigger that increments challenge progress on booking completion. |

---

## Triggered Functions

Firestore-triggered handlers (no direct invocation).

### onBookingStatusChange

- **Source:** [`../../functions/src/notifications/index.ts`](../../functions/src/notifications/index.ts)
- **Trigger:** `onDocumentUpdated` on `bookings/{bookingId}`
- **Behavior:** When `status` changes to `confirmed`, `cancelled` (by non-user), or `completed`, sends a push notification to the booking owner and writes an in-app notification document.

### onUserDeleted

- **Source:** [`../../functions/src/auth/index.ts`](../../functions/src/auth/index.ts)
- **Trigger:** `onDocumentCreated` on `deletedUsers/{userId}`
- **Behavior:** Logs the deletion. Hook for future cleanup logic (Firestore data, Auth user, storage).

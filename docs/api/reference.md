# API Reference

## Table of Contents
- [Authentication](#authentication)
- [Cloud Functions](#cloud-functions)
- [Auth Functions](#auth-functions)
- [User Functions](#user-functions)
- [Profile APIs](#profile-apis)
- [Provider Functions](#provider-functions)
- [Business Account Functions](#business-account-functions)
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

> ✅ **Implemented (cycle C1, 2026-05).**

```typescript
POST /updateAvatar

// Request
{
  avatarUrl: string;              // Firebase Storage URL from client upload
}

// Response
{
  success: true;
  avatarUrl: string;              // New avatar URL
  previousUrl: string | null;     // Previous avatar URL or null if none
}

// Error Codes
// - invalid-argument: Avatar URL outside project bucket or wrong user path
// - not-found: User document does not exist
```

### Update Social Links

> Removed (2026-10-20): there is no `updateSocialLinks` callable any more. The profile editor
> validates and normalises `socialLinks` on the client (`src/lib/socialLinks.ts`) and writes
> them to `users/{uid}` directly; `firestore.rules` accepts only an http(s) URL or an `@handle`
> of at most 200 characters per link.

### Update Notification Settings

> ✅ **Implemented (cycle C1, 2026-05).**

```typescript
POST /updateNotificationSettings

// Request
{
  settings: {
    push: {
      booking: boolean;
      promotion: boolean;
      system: boolean;
      chat: boolean;
    };
    email: {
      booking: boolean;
      promotion: boolean;
      system: boolean;
      chat: boolean;
      weeklyDigest: boolean;
    };
    sms: {
      booking: boolean;
      reminder: boolean;
    };
  };
}

// Response
{
  success: true;
}
```

### Update Privacy Settings

> ✅ **Implemented (cycle C1, 2026-05).**

```typescript
POST /updatePrivacySettings

// Request
{
  settings: {
    profileVisibility: 'public' | 'verified_only' | 'private';
    showEmail: boolean;
    showPhone: boolean;
    allowDirectMessages: boolean;
    shareAnalytics: boolean;
  };
}

// Response
{
  success: true;
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

## Business Account Functions

Companies and associations (gyms, schools, studios) are providers with `users.providerType: 'business'` and an `instructors/{uid}.business` map. All callables run in `europe-west1`; error `message` values are stable codes the client maps to localised text. Full behaviour and the complete error list: [`../backend/cloud-functions.md`](../backend/cloud-functions.md#provider-applications--business-accounts-functionssrcproviders); source: [`../../functions/src/providers/`](../../functions/src/providers/).

### Apply As Provider

Opt in as a professional: as an individual (auto-approved unless the back office switched that off) or as a company (**always** queued for an admin). Source: [`applyAsProvider.ts`](../../functions/src/providers/applyAsProvider.ts), validators in [`businessApplication.ts`](../../functions/src/providers/businessApplication.ts).

```typescript
POST /applyAsProvider

// Request
{
  categoryIds: string[];            // 1..30 taxonomy ids
  fullName?: string;
  providerType?: 'individual' | 'business';   // absent => 'individual'
  business?: {                      // required for a company
    legalName: string;              // <= 120
    vatNumber: string;              // P.IVA or an association's codice fiscale: 11 digits + checksum; spaces and "IT" accepted
    legalForm?: 'company' | 'sole_trader' | 'association' | 'other';  // absent => 'company'
    affiliationNumber?: string;     // <= 40, optional
    displayName?: string;           // <= 120, defaults to legalName
    description?: string;           // <= 1000
    website?: string | null;        // http(s) only, <= 200
    city?: string;                  // <= 80
    venueType?: 'gym' | 'wellness_center' | 'spa' | 'beauty_salon' | 'school' | 'studio' | 'outdoor_space' | 'event_space' | 'none';  // absent => 'none' (no venue)
    address?: string | null;        // <= 200; dropped when venueType is 'none'
  };
}

// Response
{
  success: true;
  providerId: string;
  autoApproved?: boolean;           // true only when this call verified them; absent when the account was already verified (nothing written)
  draftServicesSeeded: number;
}

// Errors (HttpsError, `message` is the code)
// invalid-argument:    invalid_vat | invalid_business | invalid_business_name | invalid_legal_form |
//                      invalid_affiliation_number | invalid_business_description | invalid_website |
//                      invalid_business_city | invalid_provider_type | invalid_venue_type |
//                      invalid_business_address | business_city_required | business_address_required
//                      (the last two when venueType is gym/school/studio)
// already-exists:      vat_already_registered
// failed-precondition: business_account_exists (a company re-applying as an individual) |
//                      business_already_approved | vat_change_not_allowed | provider_type_locked (a verified individual applying as a company)
// aborted:             concurrent_update

// Requires: authenticated user
```

A **rejected** applicant is queued as pending again even with auto-approval on, and an **already verified** individual re-applying is a no-op.

### Decide Provider Application

Verify or reject a provider; for a company it also creates, reactivates or deactivates the company's venue. Source: [`decideProviderApplication.ts`](../../functions/src/providers/decideProviderApplication.ts), logic in [`commitDecision.ts`](../../functions/src/providers/commitDecision.ts).

```typescript
POST /decideProviderApplication

// Request
{
  providerId: string;
  decision: 'verified' | 'rejected';
  notes?: string;
  expectedReview?: {                // required to verify a company: what the admin saw
    vatNumber: string;
    legalName: string;
    legalForm?: 'company' | 'sole_trader' | 'association' | 'other' | null;
    affiliationNumber?: string;
    venueType?: 'gym' | 'school' | 'studio' | 'none';
    address?: string | null;
  };
}

// Response
{ success: true; providerId: string; decision: string; draftServicesSeeded: number; venueId: string | null }  // venueId: set when a venue was created or reactivated

// Errors: permission-denied (Admin required | protected_account) | invalid-argument (invalid_provider_id) |
//         not-found (provider_not_found) |
//         failed-precondition (review_required | stale_review | claim_missing) |
//         already-exists (vat_already_registered | venue_exists) | aborted (concurrent_update)

// Requires: admin or superadmin role
```

Approving a company whose `venueType` is gym, school or studio creates `venues/biz_<uid>` in the same transaction; `venue_exists` is raised only when a venue at that id belongs to someone else (or a create race is lost), and then nothing of the decision is written.

### Release Business VAT

Free a `businessVat/{digits}` tax-id claim (a rejected company's, or a squatter's). Refused while the holder's instructors doc still carries the number and is not rejected, or is still listed. Audit-logged. Source: [`businessAdmin.ts`](../../functions/src/providers/businessAdmin.ts).

```typescript
POST /releaseBusinessVat

// Request
{
  vatNumber: string;                // P.IVA / codice fiscale; spaces and "IT" allowed
  reason?: string;
}

// Response
{ success: true; vatNumber: string; releasedFrom: string | null }   // uid that held the claim

// Errors: permission-denied (Admin required) | invalid-argument (invalid_vat | invalid_reason) |
//         not-found (claim_not_found) | failed-precondition (claim_in_use) | aborted (concurrent_update)

// Requires: admin or superadmin role
```

### Convert Business To Individual

```typescript
POST /convertBusinessToIndividual

// Request
{ providerId: string; reason?: string }

// Response
{ success: true; providerId: string; releasedClaims: string[] }

// Errors: permission-denied (Admin required | protected_account) | invalid-argument (invalid_provider_id | invalid_reason) |
//         not-found (provider_not_found) | failed-precondition (not_a_business)

// Requires: admin or superadmin role
```

Removes the business map and every claim of the uid, resets the public name to the person's, and deactivates the company's venue (`isActive: false`, `deactivatedBy: 'lifecycle'`, `ownerId` kept). Verification state is unchanged.

### Update Business Tax Id

```typescript
POST /updateBusinessTaxId

// Request
{
  providerId: string;
  vatNumber: string;                // required
  legalName?: string;
  legalForm?: 'company' | 'sole_trader' | 'association' | 'other' | null;
  affiliationNumber?: string | null;
  reason?: string;
}

// Response
{ success: true; providerId: string; vatNumber: string; releasedClaims: string[] }

// Errors: permission-denied (Admin required) | invalid-argument (invalid_vat | invalid_business_name | invalid_legal_form |
//         invalid_affiliation_number | invalid_provider_id | invalid_reason) |
//         already-exists (vat_already_registered | vat_carried_by_other) | failed-precondition (not_a_business)

// Requires: admin or superadmin role
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

## Group course API

All callables run in `europe-west1`; source: [`functions/src/courses/`](../../functions/src/courses/) and [`functions/src/venues/spaces.ts`](../../functions/src/venues/spaces.ts). One model serves individual providers and venues (gym, school, studio): see [features.md](../features.md#group-courses-and-activities) for behaviour and [database-schema.md](../database-schema.md#group-course-collections) for the documents. Every callable needs a signed-in caller (`unauthenticated` / "Sign in required" otherwise). Errors are `HttpsError`s whose `message` is a stable code; the client turns it into text in the five locales (`courseErrorMessage` in `src/lib/courseErrors.ts`, keys `courses.err.<code>`); the full table is below. Plain `Error`s thrown by the engine reach the client as `failed-precondition` with the code as `message` in the callables that use the course error mapper (all except `recordCoursePayment`, `confirmCourseRefund`, `cancelRemainingCourse`, `createCourseCheckout`, `saveGymSpace` and `configureGymInstructor`, where an unmapped plain error is a generic `internal`). Money is integer cents. `requestId` is any `[a-zA-Z0-9_-]{1,128}` string the client generates once per booking attempt; ids derive from it so a retry replays instead of duplicating.

**Authority.** Customer-facing calls act on the caller. Calls that manage a course (`saveCourse` on an existing course, `manageCourseSession`, `cancelCourseEnrollment` for someone else's booking, `recordCoursePayment`, `confirmCourseRefund`, `cancelRemainingCourse`, `enrollCourseParticipant`, `notifyCourseParticipant`) resolve `canManageCourse` once at entry: the course's provider (`via: owner`), an admin (`admin`), or, for a venue-linked course, the venue's owner or active staff (`venue`); anyone else gets `course_owner_required`, an inactive account `account_inactive`. See [roles-and-permissions.md](../backend/roles-and-permissions.md#group-course-authority).

| Function | Input | Result / authorization |
|---|---|---|
| `previewCourse` | `{course: CourseDraft, courseId?}` | `{sessions: [{id, startsAt, endsAt}], conflicts: [{sessionId, kind: 'room'\|'instructor', courseName, startsAt, endsAt}]}`. Advisory: applies the venue timezone and place, generates the lessons and reads the lock documents without a transaction; `courseId` (an edit) ignores the course's own slots. Venue course: caller must manage the venue (`venue_authorization_required`). Unlinked course naming an instructor: only the provider themself or an admin (`course_instructor_not_allowed`), and for an existing course someone who may manage it |
| `saveCourse` | `{course: CourseDraft, courseId?, providerId?}` | `{courseId}`. See below |
| `quoteCourse` | `{courseId, sessionIds?, includeSeries?}` | `CourseQuote`. See below |
| `enrollInCourse` | `{courseId, scope: 'lesson'\|'series', sessionId?, paymentMode?: 'direct'\|'stripe', requestId, expectedFinalCents, expectedRevisions}` | `{enrollmentId, state: 'held'\|'confirmed', totalCents, replay}`. See below |
| `enrollCourseParticipant` | `{courseId, userId, scope, sessionId?, requestId}` | Same result. Course manager (owner, venue staff, admin) books a linked client: needs the `clients` pair between the course's provider and `userId` (`provider_client_required`), direct payment only (`direct_payment_required`), no price check but the venue discount applies |
| `joinCourseWaitlist` | `{courseId, sessionId, requestId, paymentMode?}` | `{success: true, position, replay}`. See below |
| `leaveCourseWaitlist` | `{courseId, sessionId}` | `{success: true}`; removes the caller's entry and renumbers the rest; no entry is a no-op |
| `cancelCourseEnrollment` | `{enrollmentId, sessionIds?, reason?}` | `{success}`. The customer before the booking's cancellation deadline, or a course manager; frees the seats, creates refund obligations, promotes the waitlist |
| `recordCoursePayment` | `{enrollmentId, method: 'cash'\|'satispay'\|'bank_transfer'\|'other'}` | Full active direct-payment confirmation; course manager; advance payment supported |
| `manageCourseSession` | `{courseId, sessionId, action, ...}` | `{success: true}`; course manager. Actions below |
| `cancelRemainingCourse` | `{courseId, reason}` | Closes enrollment, archives the course, cancels every future lesson, releases its locks, clears its waitlists, releases the bookings; course manager |
| `confirmCourseRefund` | `{refundId}` | Records a direct refund as completed; course manager (the course comes from the refund's `courseId`, or from its enrollment for refunds written before the unified model) |
| `notifyCourseParticipant` | `{courseId, userId, channel: 'email'\|'phone'}` | Course manager; acts for the course's provider. See "Provider course participants" |
| `createCourseCheckout` | `{enrollmentId}` | `{url}`; enrollment customer; both payment flags required; server-derived price, stable Stripe idempotency parameters; refuses a zero-amount hold and one below the Stripe minimum |
| `saveGymSpace` | `{kind: 'location', venueId, id?, name, address, city, timezone?, isActive}` or `{kind: 'room', venueId, locationId, id?, name, isActive}` | `{id}`. Venue owner, active staff or admin of a gym/school/studio (`venue_authorization_required`; any other venue type is `gym_not_found`); the timezone must be an IANA zone; a room needs an existing location (`gym_location_not_found`). The input is validated with Zod and the timezone check is not wrapped by the course error mapper, so a malformed request is a generic error, not a code |
| `configureGymInstructor` | `{venueId, instructorId, partnerStatus: 'pending'\|'active'\|'suspended', isActive}` | `{success}`. Admin only (`admin_required`); the instructor must be a verified provider and the venue a hosting type (`verified_instructor_required`); writes `venues/{v}/instructors/{i}` and `instructors/{i}.partnerStatus` together. An `active` partner instructor adds the venue's `partnerInstructorExtraPercent` to the lessons they teach |
| `setPaymentSettings` | `{stripePaymentsEnabled?, subscriptionsEnabled?, courseCheckoutEnabled?}` | Audited superadmin-only settings update; unknown/nonboolean keys rejected |

### `saveCourse`

Creates or edits a course and regenerates its lessons in one transaction. `CourseDraft` is `src/types/course.ts` (server schema `courseSchema` in `core.ts`): name, description, `categoryId`, free-text `location`/`city`/`instructor`, `venueId`, `locationId`, `roomId`, `instructorId` (each `string | null`), `waitlistEnabled` (default true), `capacity` 1..500, `durationMinutes` 10..480, `startDate`, `startTime`, `timezone`, `recurrence` (`none|daily|weekly`) with `interval`, `weekdays`, `endDate`, `lessonPriceCents` / `seriesPriceCents` (integer 0..10,000,000 or null; at least one; **0 means free**), `bookingNoticeHours`, `cancellationHours`, `level`, `equipment`, `state` (`draft|published|archived`), `enrollmentClosed`.

- **Provider.** On edit the stored `providerId` stays (the client value is ignored) and the caller must manage the course. On create without a venue it is the caller (`providerId` of another user needs an admin). On create with a venue it is the venue's `ownerId` (staff create on the owner's behalf; `venue_owner_required` if the venue has none); an admin may pass `providerId`.
- **Venue link.** Checked for a new link only (an existing link is not re-validated, so a venue whose type later changes does not trap its courses): the venue must host courses and the caller must manage it, else `venue_authorization_required`. Publishing a venue course needs `isActive !== false` and `partnerStatus === 'active'`, else `venue_not_active`; drafts and archiving are always allowed.
- **Spaces and instructor** (re-validated for a new course, a changed link or a publish): `locationId` and `roomId` required and active (`invalid_space`); the server overwrites `timezone` with the location's, `location` with `"<room> · <location>"` and `city`; `instructorId` must be a usable provider (verified, active, not pending/rejected/suspended) and, for a venue course, linked and active at the venue (`invalid_instructor`), and its name overwrites `instructor`. Without a venue `locationId`/`roomId` are forced to null and `instructorId` may only be the provider (`course_instructor_not_allowed`).
- **Locks.** The lessons' room and instructor slots are taken or released in the same transaction (published course, scheduled lessons that have not ended): `room_overlap` / `instructor_overlap` with `details: {courseName, startsAt, endsAt}` of the conflicting slot, nothing written. More than 400 lessons that take a lock: `locked_schedule_too_long` (`details.fields`).
- **Booked courses.** Once a course has bookings, its schedule, prices, `venueId`, `locationId`, `roomId`, `instructorId`, timezone, recurrence fields and (when unlinked) place/instructor text are frozen (`booked_schedule_locked`); capacity cannot fall below an upcoming lesson's bookings (`capacity_below_bookings`).
- **Per lesson.** Each lesson gets `courseId`, `courseName`, `timezone`, `venueId`, `locationId`, `roomId`, `instructorId`, `instructorName`, `listed`, `waitlisted` and a `revision` (1 for new; +1 when price, capacity, notice or cancellation terms change, or the lesson's time, room or instructor change). A lesson-level room or substitute and a lesson-level capacity survive edits that do not change that course value.
- **After the commit.** Lessons whose capacity grew and that have a waitlist are served by `promoteWaitlist`; a failure there is logged, never returned (the sweep is the backstop). Unpublishing or archiving clears the lessons' waitlists.
- Other errors: `start_must_be_future` (first publish with a past start), `active_leaf_required` (category), `provider_unavailable`, `account_inactive`, validation (`course_validation_failed` with `details.fields`, `pricing_required`, `invalid_timezone`, `end_date_required`, `weekdays_required`, `invalid_date`, `schedule_too_long` (over three years), `empty_schedule`, `invalid_local_time`, `ambiguous_local_time`; the schedule errors also carry `details.fields`).

### `quoteCourse`

Server-computed prices for a customer to review. `sessionIds` defaults to the first 100 lessons (more than 100 ids: `too_many_sessions`); `includeSeries: false` skips reading the whole course when only lessons are sold. Rate limited to 60 calls per 10 minutes per caller (`rate_limited`). A course that is not published and eligible is `course_not_found` unless the caller manages it; a venue course of an inactive partner is `venue_not_active` for everyone else; ids outside the course are `session_not_in_course`.

```ts
CourseQuote = {
  sessions: SessionQuote[]; // [] when the course has no lesson price
  series: null | { regularCents, discountPercent, gymPercent, instructorPercent, discountCents, finalCents,
                   stripeEligible, allocations: Record<sessionId, cents>, revisions: Record<sessionId, number> };
};
SessionQuote = { sessionId, revision, regularCents, discountPercent, gymPercent, instructorPercent, discountCents,
                 finalCents, availableSeats, waitlisted, stripeEligible };
```

`discountPercent = min(100, gymPercent + instructorPercent)`: `gymPercent` is the venue's `memberDiscountPercent`, `instructorPercent` its `partnerInstructorExtraPercent` when the lesson's effective instructor (the lesson's substitute, else the course's) has `partnerStatus: 'active'`. An unlinked course has all percents 0. `discountCents = floor(regular * percent / 100)`. The series price is split across the lessons first (`allocatePrice`), then each share is discounted with its own lesson's percent and floored, so `allocations` are post-discount and sum to `finalCents`; the series block's percents are those of the course-level instructor. `stripeEligible` is `finalCents >= 50`. `availableSeats = max(0, capacity - occupied - held)`.

### `enrollInCourse`

A customer confirms the quote they reviewed. Send `expectedFinalCents` (the quote's `finalCents` for the lesson or the series) and `expectedRevisions` (`{[sessionId]: revision}` for every booked lesson; for a series, `series.revisions`). Inside the booking transaction the server re-prices and compares: a different amount fails `price_changed` with `details: {reason: 'price'}`, a different revision `{reason: 'availability'}`; nothing is written. Missing values: `expected_price_required` (the staff path, `enrollCourseParticipant`, skips the check). A replay of the same `requestId` returns the stored result without re-checking. Other behaviour:

- Order of checks after replay: course exists, not the provider's own course (`cannot_book_yourself`), provider eligible (`provider_unavailable`), caller active (`account_inactive`), a series only before its first lesson (`series_already_started`), course published and open (`enrollment_closed`), no existing membership (`already_enrolled`), then per lesson `session_unavailable`, `lesson_full`, `booking_deadline` (notice window), then venue active (`venue_not_active`) and the price check.
- `lesson_full` has `details: {waitlistAvailable}`, true for a single lesson of a course with the waitlist on while the notice window is still open; the client then offers `joinCourseWaitlist`.
- A series with any full or unavailable lesson creates nothing.
- `totalCents` is the quote's final price. A total of 0 is booked `direct`, `confirmed`, `paid` (`paymentMethod: 'free'`) whatever the requested mode; `paymentMode: 'stripe'` while course checkout is off answers "Online course payments are not enabled" (checked before the price is known, so clients send `direct` for a free lesson); a Stripe total between 1 and 49 cents fails `checkout_amount_too_low` with `details: {minCents: 50}`.
- Stored on the enrollment: `venueId`, `regularCents`, `discountCents`, `discountPercent`, `gymPercent`, `instructorPercent`, `sessionRevisions`, post-discount `allocations`, `promotedFromWaitlist: false`.

### `joinCourseWaitlist`

Joins the waitlist of one full lesson (single lessons only). The entry stores `requestId` and `paymentMode` so promotion later books it as an ordinary replay-safe enrollment (`skipPriceCheck`). In one transaction: the same `requestId` already on the list returns the stored `position` with `replay: true`; another `requestId` while on the list is `already_waitlisted`; a `requestId` already used by an enrollment is `request_id_reused`. Refusals (`failed-precondition`): `waitlist_disabled` (course setting), `already_enrolled`, `already_waitlisted`, `waitlist_not_open` (course not published or closed, lesson not scheduled, seats free, or the booking-notice window already closed), `waitlist_full` (100 entries). Also `account_inactive`, `cannot_book_yourself`, `provider_unavailable`, `venue_not_active`, and, for `paymentMode: 'stripe'` while checkout is off, "Online course payments are not enabled". `position` is `waitlisted + 1`; positions stay contiguous.

### `manageCourseSession` actions

All need `courseId`, `sessionId`, `action`, a course manager, and the course/lesson to exist.

| `action` | Extra input | Effect and errors |
|---|---|---|
| `attendance` | `userId`, `attendance: 'present'\|'absent'\|'unmarked'` | The participant must be confirmed, the lesson started and not cancelled (`attendance_unavailable`; `invalid_attendance`). `absent` sets `participants/{uid}.noShow` and adds 1 to `courses/{id}/customers/{uid}.noShows`; leaving `absent` subtracts it; marking `absent` twice counts once |
| `cancel` | `reason` (required: `reason_required`) | Lesson to `cancelled` and unlisted, its room/instructor slots released, its waitlist cleared (`waitlist_cleared`), every booking released with refunds and a `cancelled_by_trainer` notice (`cancelled_by_client` goes to customers who cancel themselves); when it was the last scheduled lesson the course is archived. Past lessons: `cannot_change_past_lesson`. A repeated call changes nothing |
| `reschedule` | `startsAt` (ISO instant), `roomId?`, `reason` | New start (same duration) and optionally another active room of the lesson's location; `revision` +1; locks moved (`room_overlap` / `instructor_overlap`, nothing written); the lesson's waitlist cleared; every participant gets `rescheduled`. Refused with held seats or a non-scheduled lesson (`session_unavailable`), a start inside the booking-notice window (`invalid_start_time`), an unusable room (`invalid_space`), a past lesson (`cannot_change_past_lesson`). The room is ignored for an unlinked course |
| `substitute` | `instructorId`, `reason?` | The lesson gets another instructor (usable provider; linked and active at the venue for a venue course; an unlinked course only allows its provider unless an admin acts): `instructorId`/`instructorName`/`instructor` set, the instructor lock moved (`instructor_overlap`), `revision` +1, every participant gets `instructor_changed` with the reason. Same instructor as now: `invalid_instructor`. Existing enrollments keep their price; a new quote uses the substitute's partner status |
| `removeParticipant` | `userId`, `reason?` | Releases that customer's seat in this lesson through the customer-cancellation path: refund obligation, `cancelled_by_trainer` notice, waitlist promotion. Past lessons: `cannot_cancel_past_lesson`; unknown participant: `participant_not_found`. When the lesson starts within the booking's `cancellationHours`, it is also recorded as a late cancellation (`lateCancelledSessionIds`, `lateCancels` +1), no fee |
| `removeWaitlistEntry` | `userId` | Deletes the entry, renumbers the rest, tells the customer (`waitlist_removed`, reason `staff`) |
| `capacity` | `capacity` 1..500 | Sets the lesson's capacity (`invalid_capacity`; not below booked + held: `capacity_below_bookings`; scheduled future lessons only), `revision` +1, then serves the waitlist after the commit (a failure is logged, not returned) |

An unknown `action` is `invalid_session_action`.

### Error codes

`details` in brackets. The five-locale client texts are `courses.err.<code>` (`price_changed` also has `_price` and `_availability`); codes with no text there show the generic `courses.error`.

| Code | `HttpsError` | When |
|---|---|---|
| `venue_authorization_required` | permission-denied | Not owner, active staff or admin of the venue, or the venue does not host courses |
| `venue_owner_required` | permission-denied | Staff create for a venue that has no `ownerId` |
| `venue_not_active` | failed-precondition | Venue inactive or `partnerStatus` not `active` (publish, quote, enroll, join) |
| `course_owner_required` | permission-denied | Caller does not manage the course |
| `course_instructor_not_allowed` | permission-denied | Unlinked course names an instructor other than its provider (non-admin) |
| `account_inactive`, `provider_unavailable` | permission-denied / failed-precondition | Suspended or deleted account; provider not verified/active |
| `invalid_space` | invalid-argument | Location or room missing, inactive, or not of this venue/location |
| `invalid_instructor` | invalid-argument | Instructor not usable, not linked/active at the venue, or unchanged on `substitute` |
| `room_overlap`, `instructor_overlap` | failed-precondition | [`courseName`, `startsAt`, `endsAt` of the conflicting slot] |
| `locked_schedule_too_long` | failed-precondition | More than 400 upcoming lessons that take a room or instructor lock [`fields`] |
| `booked_schedule_locked` | failed-precondition | A frozen field changed on a booked course |
| `price_changed` | failed-precondition | [`reason`: `price` or `availability`] |
| `expected_price_required` | invalid-argument | Customer enrollment without `expectedFinalCents`/`expectedRevisions` |
| `lesson_full` | failed-precondition | [`waitlistAvailable`: boolean] (replaces `session_full`) |
| `already_waitlisted`, `waitlist_disabled`, `waitlist_full`, `waitlist_not_open` | failed-precondition | Waitlist refusals |
| `checkout_amount_too_low` | failed-precondition | [`minCents`: 50] Stripe total of 1..49 cents |
| `request_id_reused` | invalid-argument | The `requestId` belongs to a different booking |
| `already_enrolled`, `enrollment_closed`, `booking_deadline`, `series_already_started`, `session_unavailable`, `pricing_option_unavailable`, `empty_schedule` | failed-precondition | Booking preconditions |
| `cancellation_deadline`, `cannot_cancel_past_lesson`, `cannot_change_past_lesson`, `invalid_start_time`, `attendance_unavailable` | failed-precondition | Time rules for cancelling, changing, rescheduling and marking attendance |
| `capacity_below_bookings`, `invalid_capacity` | failed-precondition | Capacity rules |
| `reason_required` | invalid-argument / failed-precondition | A reason is mandatory for cancel, reschedule, `cancelRemainingCourse` |
| `participant_not_found`, `enrollment_not_found`, `course_not_found`, `session_not_found`, `refund_not_found` | not-found | Unknown ids |
| `enrollment_owner_required` | permission-denied | Checkout for someone else's enrollment |
| `provider_client_required` | failed-precondition / permission-denied | No `clients` pair for staff enrollment or invitation |
| `direct_payment_required`, `direct_refund_required`, `direct_confirmed_enrollment_required` | invalid-argument / failed-precondition | Direct-payment rules for staff bookings, refunds and payment recording |
| `checkout_hold_unavailable` | failed-precondition | Held seat expired/absent, or a zero-amount hold |
| `rate_limited` | resource-exhausted | `quoteCourse` 60 per 10 minutes; `notifyCourseParticipant` 100 per hour per provider |
| "Online course payments are not enabled" | failed-precondition | Stripe course checkout is off (the one message that is a sentence; the client maps it to `online_payments_disabled`) |
| `invalid_booking_option`, `invalid_channel`, `invalid_payment_method`, `invalid_attendance`, `invalid_sessions`, `invalid_session_action`, `invalid_id`, `session_not_in_course`, `too_many_sessions` | invalid-argument / failed-precondition | Malformed input |
| `admin_required`, `verified_instructor_required`, `invalid_instructor_partnership`, `gym_not_found`, `gym_location_not_found` | mixed | `saveGymSpace` / `configureGymInstructor` |
| `phone_required`, `email_required` | failed-precondition | `notifyCourseParticipant` contact missing |
| `course_validation_failed`, `pricing_required`, `invalid_timezone`, `end_date_required`, `weekdays_required`, `invalid_date`, `schedule_too_long`, `invalid_local_time`, `ambiguous_local_time`, `start_must_be_future`, `active_leaf_required` | invalid-argument / failed-precondition | Course input and schedule validation [`fields`] |

`courseStripeWebhook` is an HTTP endpoint with Stripe raw-body signature verification. Configure Checkout completed/expired and refund.updated events. Browser redirects never mark paid. Repeated events preserve settlement/refund state. Payments received after hold expiry/cancellation enqueue refunds (and the freed seat is offered to the waitlist).

### Scheduled functions and triggers

- `maintainCourseEnrollments` (every five minutes, 540 s): (1) releases up to 100 expired Stripe holds (each release offers the seat to the waitlist); (2) `sweepWaitlists`: serves lessons whose `waitlisted` counter is above zero (promotes into free seats, or closes the list with `waitlist_cleared` when the booking-notice window is over) and, through a second scan of the `waitlist` entries, lessons whose counter fell behind their entries; cursors in `courseSweepState/waitlist`; bounded to 50 × 4 lessons per run; (3) processes pending/processing Stripe refunds in pages; (4) advances `nextStartsAt` of published courses after a lesson starts, archiving (and unlisting the lessons of) a course with nothing left; (5) `sweepElapsedLocks`: deletes lock slots of lessons that have ended and empty day documents; (6) retries interrupted lesson cancellations (`cancellationReconciled == false`, 100 per run).
- `remindCourseParticipants` (every 60 minutes): idempotent `reminder_24h` notices for confirmed participants of lessons in the next 24 hours.
- `onCourseNotification` (Firestore trigger on `courseNotifications/{id}`): builds the message in the recipient's `preferredLanguage` (`functions/src/notifications/bookingMessages.ts`, all five locales), writes the in-app notification, sends push and (unless disabled) email. The outbox id is derived from the event key, so a repeated event creates one notice. Provider-side notices link to `/provider/courses` (or `/provider/courses?venue=<id>` for a venue course), customers to `/courses?tab=bookings`.
- `onCourseProviderEligibility` (trigger on `instructors/{providerId}`, `retry: true`): when a provider becomes or stops being eligible it flips `providerEligible` on their courses and `listed` on every lesson (published and eligible), 400 lessons per transaction, repeating until done; a half-done pass leaves `listingSyncPending` on the course so the next change finishes it.

Course notification events: `accepted`, `new_request`, `payment_confirmed`, `cancelled_by_client`, `cancelled_by_trainer`, `rescheduled`, `reminder_24h`, plus the unified-model events `waitlist_promoted` (confirmed booking), `waitlist_promoted_hold` (online payment, seat held 30 minutes), `waitlist_cleared` (the lesson's list was closed: cancelled, moved, archived or too close), `waitlist_removed` (one entry left; the reason code `payment_unavailable`, `amount_too_low` or `staff` picks the sentence and is never printed) and `instructor_changed` (substitution, with the reason when given). A promoted customer gets only the waitlist notice, not a second "accepted".

### Provider course participants

- `enrollCourseParticipant({courseId,userId,scope:"lesson"|"series",sessionId?,requestId})`: course owner, active staff of the course's venue or admin (`canManageCourse`), requires that participant’s provider-client pair, atomically reserves capacity using the same policy checks as customer enrollment. Direct payment only; returns the ordinary enrollment response. `createdBy` audits the actor. Retry with the same request ID is idempotent.
- `createClientAccount({fullName,email,phone?,notifyByEmail?})`: verified provider only; creates an invited identity and client pair or reuses the existing normalized-email account. `notifyByEmail` defaults true; course enrollment UI passes false so invitation is an explicit subsequent action. Name/email required, phone optional. Shared account lookup/creation rate limit remains 20/day.
- `notifyCourseParticipant({courseId,userId,channel:"email"|"phone"})`: the caller must manage the course (owner, venue staff, admin); the notice is sent on behalf of the course's provider, whose active verified status and existing client pair are required (`provider_client_required`); the rate limit and the provider name in the message are the provider's. Email returns `{status:"sent"|"failed"}`; pending account setup links go only to the actual profile email. Phone requires a stored number and returns `{status:"ready",url,message,smsUrl,whatsAppUrl}`. The URL is a credential-free registration landing page for invitees or course bookings for existing users. The provider must send the phone message themselves. Rate: 100 attempts/hour/provider.

`/auth/participant/?email=...` publicly completes an invited account by requesting private email password setup; it does not create a second UID. First successful account claiming through `syncEmailVerification` activates all provider relationships.

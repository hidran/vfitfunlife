# API Reference

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

## Provider Functions

### Create Provider Profile

```typescript
POST /createProviderProfile

// Request
{
  userTypeId: string;           // e.g., "personal_trainer"
  bio: string;
  shortBio: string;
  specialties: string[];
  certifications: string[];
  experienceYears: number;
  languages: string[];
  workingHours: {
    day: number;                // 0-6 (Sunday-Saturday)
    start: string;              // "09:00"
    end: string;                // "18:00"
    isAvailable: boolean;
  }[];
}

// Response
{
  providerId: string;
  status: 'pending_verification';
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
  certifications: string[];
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
  sortBy?: 'rating' | 'distance' | 'bookings' | 'newest';
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
  }[];
  nextCursor?: string;
  totalCount: number;
}
```

### Add/Update Provider Service

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
}

// Response
{
  serviceId: string;
  success: boolean;
}
```

### Set Provider Availability

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

### Get Booking Details

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
}
```

### List User Bookings

```typescript
POST /listUserBookings

// Request
{
  status?: ('pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled')[];
  fromDate?: string;
  toDate?: string;
  limit?: number;
  cursor?: string;
}

// Response
{
  bookings: {
    id: string;
    serviceName: string;
    providerName?: string;
    venueName?: string;
    scheduledAt: string;
    status: string;
    finalPrice: number;
    canCancel: boolean;
  }[];
  nextCursor?: string;
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

```typescript
POST /createPaymentIntent

// Request
{
  bookingId: string;
  isDeposit?: boolean;          // Pay deposit only vs full amount
  paymentMethodId?: string;     // Saved payment method
}

// Response
{
  clientSecret: string;         // For Stripe.js
  paymentIntentId: string;
  amount: number;
  currency: 'eur';
}
```

### Create VIP Subscription

```typescript
POST /createVipSubscription

// Request
{
  planId: string;               // 'monthly' | 'quarterly' | 'yearly'
  paymentMethodId: string;
}

// Response
{
  subscriptionId: string;
  clientSecret: string;         // For 3D Secure
  status: 'active' | 'requires_action';
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
}

// Response
{
  success: boolean;
  verifiedAt: string;
}

// Requires: admin or superadmin role
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

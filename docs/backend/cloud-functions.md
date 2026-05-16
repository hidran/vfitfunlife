# Cloud Functions Documentation

## Overview

Cloud Functions for V Fitness handle server-side business logic including:
- User authentication lifecycle
- Booking management
- Payment processing (Stripe integration)
- Push notifications
- Scheduled tasks
- Data aggregation

**Runtime:** Node.js 24 (per `firebase.json`)
**Region:** `europe-west1` (override via `FIREBASE_REGION` env var)

## Function Modules

### Auth Functions (`../../functions/src/auth/`)

#### `initializeUserProfile`
- **Type:** Callable (invoked from client after sign-up)
- **Auth:** Authenticated user
- **Description:** Creates user document in Firestore with default values (idempotent — updates `lastLoginAt` if profile already exists).
- **Returns:** `{ success: boolean, isNewUser: boolean }`
- **Actions:**
  - Creates user profile with `role: "customer"` and default permissions
  - Generates unique referral code
  - Awards 100 welcome points (logged in `pointsTransactions` subcollection)

#### `onUserDeleted`
- **Trigger:** Firebase Auth user deletion
- **Description:** Soft-deletes user data

#### `applyReferralCode`
- **Type:** Callable
- **Parameters:** `{ referralCode: string }`
- **Returns:** `{ success: boolean, pointsEarned: number }`
- **Description:** Applies referral code and awards points to both users

---

### Booking Functions (`/functions/src/bookings/`)

#### `createBooking`
- **Type:** Callable
- **Parameters:**
  ```typescript
  {
    venueId: string;
    serviceId: string;
    instructorId?: string;
    scheduledAt: string; // ISO date
    bookingType: 'in_venue' | 'home_service' | 'virtual' | 'outdoor';
    serviceAddress?: { street, city, postalCode, latitude, longitude };
    promotionCode?: string;
    usePoints?: boolean;
    userNotes?: string;
  }
  ```
- **Returns:** `{ bookingId, finalPrice, depositAmount, pointsUsed, pointsEarned }`
- **Description:** Creates a new booking with pricing calculations

#### `cancelBooking`
- **Type:** Callable
- **Parameters:** `{ bookingId: string, reason?: string }`
- **Returns:** `{ success: boolean, refundAmount: number }`
- **Description:** Cancels booking with refund policy:
  - 24+ hours: 100% refund
  - 12-24 hours: 50% refund
  - <12 hours: No refund

#### `confirmBooking`
- **Type:** Callable
- **Parameters:** `{ bookingId: string }`
- **Description:** Confirms a pending booking

---

### Payment Functions (`/functions/src/payments/`)

#### `createStripeCustomer`
- **Type:** Callable
- **Returns:** `{ customerId: string }`
- **Description:** Creates Stripe customer for user

#### `createPaymentIntent`
- **Type:** Callable
- **Parameters:** `{ bookingId: string, isDeposit?: boolean }`
- **Returns:** `{ clientSecret: string, paymentIntentId: string }`

#### `createVipSubscription`
- **Type:** Callable
- **Parameters:** `{ planId: string }`
- **Returns:** `{ subscriptionId: string, clientSecret: string }`

#### `addWalletFunds`
- **Type:** Callable
- **Parameters:** `{ amount: number }` (€10-500)
- **Returns:** `{ clientSecret: string }`

#### `stripeWebhook`
- **Type:** HTTP
- **Endpoint:** `POST /stripeWebhook`
- **Description:** Handles Stripe webhook events:
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`
  - `customer.subscription.created/updated/deleted`
  - `invoice.payment_succeeded`

---

### Notification Functions (`/functions/src/notifications/`)

#### `registerFcmToken`
- **Type:** Callable
- **Parameters:** `{ token: string, platform: 'ios' | 'android' | 'web' }`
- **Description:** Registers FCM token for push notifications

#### `markNotificationRead`
- **Type:** Callable
- **Parameters:** `{ notificationId: string }`

#### `markAllNotificationsRead`
- **Type:** Callable
- **Returns:** `{ markedCount: number }`

#### `sendVipNotification`
- **Type:** Callable (Admin only)
- **Parameters:** `{ title: string, body: string, imageUrl?: string }`
- **Description:** Sends push to all VIP users

#### `onBookingStatusChange`
- **Trigger:** Firestore document update on `/bookings/{bookingId}`
- **Description:** Sends push notifications when booking status changes

---

### User Functions (`/functions/src/users/`)

#### `updateProfile`
- **Type:** Callable
- **Parameters:** `{ fullName?, dateOfBirth?, preferredLanguage?, preferredSection?, notificationsEnabled? }`

#### `getUserStats`
- **Type:** Callable
- **Returns:** `{ completedBookings, totalPointsEarned, reviewsWritten, activeChallenges, referralCount }`

#### `saveAddress`
- **Type:** Callable
- **Parameters:** `{ addressId?, address: {...} }`
- **Returns:** `{ addressId: string }`

#### `deleteAddress`
- **Type:** Callable
- **Parameters:** `{ addressId: string }`

#### `getLeaderboard`
- **Type:** Callable
- **Parameters:** `{ type?: 'points' | 'bookings', limit?: number }`
- **Returns:** `{ leaderboard: LeaderboardEntry[] }`

#### `submitReview`
- **Type:** Callable
- **Parameters:** `{ bookingId: string, rating: number, comment?: string, images?: string[] }`
- **Returns:** `{ reviewId: string, pointsEarned: number }`
- **Description:** Submits review and awards 50 points

---

### Scheduled Functions (`/functions/src/scheduled/`)

#### `sendBookingReminders`
- **Schedule:** Every hour
- **Description:** Sends 24h and 2h booking reminders

#### `processCompletedBookings`
- **Schedule:** Every 30 minutes
- **Description:** Marks past bookings as completed, awards points

#### `expireVipSubscriptions`
- **Schedule:** Daily at midnight
- **Description:** Expires VIP subscriptions and notifies users

#### `expirePromotions`
- **Schedule:** Daily at 1 AM
- **Description:** Deactivates expired promotion codes

#### `aggregateDailyStats`
- **Schedule:** Daily at 2 AM
- **Description:** Aggregates daily statistics

#### `cleanupOldNotifications`
- **Schedule:** Weekly on Sunday at 3 AM
- **Description:** Deletes read notifications older than 30 days

#### `updateChallengeProgress`
- **Trigger:** Firestore update on `/bookings/{bookingId}`
- **Description:** Updates challenge progress when booking completes

---

## Additional Functions (Audit Sync 2026-05)

These functions are exported from `../../functions/src/index.ts` but were missing from the original module sections above. They are grouped here by domain. Detailed reference for role and seeding flows lives in `./roles-and-permissions.md` and `./seeding.md`.

### Provider Management (`../../functions/src/users/roles.ts`)

#### `createProviderProfile`
- **Type:** Callable
- **Auth:** Authenticated user. Admin/superadmin create providers directly; non-staff submit a `providerApplications` doc with `status: "pending"`.
- **Purpose:** Create a provider account (staff) or apply to become a provider (customer).
- See `./roles-and-permissions.md` for the application/approval flow.

#### `updateProviderProfile`
- **Type:** Callable
- **Auth:** Provider (own profile only). System-managed fields (`isVerified`, `rating`, `reviewCount`) are preserved.
- **Purpose:** Update bio, specialties, languages, hourly rate, etc.

#### `verifyProvider`
- **Type:** Callable
- **Auth:** Admin or superadmin (`requireAdmin`).
- **Purpose:** Mark a provider as verified/unverified; writes an entry to `verificationLogs`.

#### `listProviders`
- **Type:** Callable (public; auth optional)
- **Auth:** Anonymous callers see only verified providers; staff see all and may filter by `isVerified`.
- **Purpose:** Paginated provider directory, filterable by `userType`.

### Role & User Management (`../../functions/src/users/roles.ts`)

#### `setUserRole`
- **Type:** Callable
- **Auth:** Superadmin only (`requireSuperAdmin`). Self-demotion from superadmin is blocked.
- **Purpose:** Assign a role and recalculate permissions. Writes audit entry to `roleChangeLogs`.
- See `./roles-and-permissions.md` for the role/permission matrix.

#### `getUserPermissions`
- **Type:** Callable
- **Auth:** Authenticated user (own permissions).
- **Purpose:** Returns `role`, `permissions`, `isProvider`, `isAdmin`, `isSuperAdmin`, `canAccessAdminPanel` flags.

#### `setUserActiveStatus`
- **Type:** Callable
- **Auth:** Admin or superadmin. Non-superadmin cannot modify superadmin accounts; cannot deactivate self.
- **Purpose:** Activate/deactivate a user account.

#### `listUsers`
- **Type:** Callable
- **Auth:** Admin or superadmin (`requireAdmin`).
- **Purpose:** Paginated user list with optional `role` filter.

### Demo Data / Admin Seeding (`../../functions/src/seed/seedData.ts`)

All seed endpoints are HTTP (not callable) and require a Bearer ID token in the `Authorization` header. See `./seeding.md` for usage and payloads.

#### `seedAllData`
- **Type:** HTTP `POST /seedAllData`
- **Auth:** Admin or superadmin (bearer token).
- **Purpose:** Seeds providers, customers, venues, classes, bookings, reviews. Body accepts per-collection counts.

#### `seedQuickData`
- **Type:** HTTP `POST /seedQuickData`
- **Auth:** Admin or superadmin (bearer token).
- **Purpose:** Minimal demo dataset for fast local/staging bootstrap.

#### `clearAllData`
- **Type:** HTTP `POST /clearAllData`
- **Auth:** Superadmin only (bearer token).
- **Purpose:** Wipes seeded demo collections.

### User Types (`../../functions/src/users/userTypes.ts`)

#### `seedUserTypes`
- **Type:** Callable
- **Auth:** Admin (`checkIsAdmin`).
- **Purpose:** Seeds the `userTypes` collection from `../../functions/src/seed/userTypes.ts`. Accepts `{ force?: boolean }` to overwrite existing docs.

#### `getUserTypes`
- **Type:** Callable (public)
- **Auth:** None.
- **Purpose:** List all user types, optionally filtered by `category` and `activeOnly`.

#### `getUserType`
- **Type:** Callable (public)
- **Auth:** None.
- **Purpose:** Fetch a single user type by `id`.

#### `getUserTypesByCategory`
- **Type:** Callable (public)
- **Auth:** None.
- **Purpose:** List active user types for a given `category`.

#### `updateUserType`
- **Type:** Callable
- **Auth:** Admin (`checkIsAdmin`).
- **Purpose:** Patch allowed fields (`name`, `slug`, `description`, `icon`, `category`, `services`, `requirements`, `isActive`, `displayOrder`, `tags`).

#### `listProviderTypes`
- **Type:** Callable (public)
- **Auth:** None.
- **Purpose:** Static list of supported provider type slugs with localized labels (IT/EN).

### Booking (additional) (`../../functions/src/bookings/index.ts`)

#### `getBooking`
- **Type:** Callable
- **Parameters:** `{ bookingId: string }`
- **Auth:** Authenticated. Owner (`userId`), assigned provider (`instructorId`), or admin.
- **Purpose:** Fetch a single booking with permission checks.

#### `listBookings`
- **Type:** Callable
- **Parameters:** `{ status?, limit?, offset?, asProvider?: boolean }`
- **Auth:** Authenticated. Customers see their own bookings; providers see their own customer bookings unless `asProvider: true`, in which case they see bookings where `instructorId === uid`; admins/superadmins see all.
- **Purpose:** Paginated booking list scoped by role.

#### `updateBookingStatus`
- **Type:** Callable
- **Parameters:** `{ bookingId, status, notes? }` — status one of `pending | confirmed | in_progress | completed | cancelled | no_show`.
- **Auth:** Admin or superadmin.
- **Purpose:** Move a booking to any valid status, stamp `statusUpdatedBy/At`, and notify the user.

---

## Environment Variables

Required in Firebase Functions config:

```bash
# Stripe
firebase functions:config:set stripe.secret_key="sk_xxx"
firebase functions:config:set stripe.webhook_secret="whsec_xxx"
```

Or in `.env` for local development:
```
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

---

## Deployment

```bash
# Deploy all functions
npm run deploy:functions

# Deploy specific function
firebase deploy --only functions:createBooking

# View logs
firebase functions:log

# Local testing
npm run serve
```

---

## Error Handling

All callable functions throw `HttpsError` with codes:
- `unauthenticated` - User not logged in
- `permission-denied` - Not authorized
- `not-found` - Resource not found
- `already-exists` - Duplicate operation
- `failed-precondition` - Invalid state
- `invalid-argument` - Bad input

Example error handling in client:
```typescript
try {
  const result = await createBooking(data);
} catch (error) {
  if (error.code === 'functions/not-found') {
    // Handle not found
  }
}
```

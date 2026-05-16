# Cloud Functions Documentation

## Overview

Cloud Functions for V Fitness handle server-side business logic including:
- User authentication lifecycle
- Booking management
- Payment processing (Stripe integration)
- Push notifications
- Scheduled tasks
- Data aggregation

## Function Modules

### Auth Functions (`/functions/src/auth/`)

#### `onUserCreated`
- **Trigger:** Firebase Auth user creation
- **Description:** Creates user document in Firestore with default values
- **Actions:**
  - Creates user profile
  - Generates unique referral code
  - Awards 100 welcome points

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

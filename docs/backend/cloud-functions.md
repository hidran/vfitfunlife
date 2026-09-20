# Cloud Functions Documentation

## Overview

Cloud Functions for V Fitness handle server-side business logic including:
- User authentication lifecycle
- Booking management
- Payment processing (Stripe integration)
- Push notifications
- Scheduled tasks
- Data aggregation
- AI authoring (workout plans, generic recipe suggestions)

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

### Availability (`../../functions/src/availability/`)

One schedule per provider — `instructors/{uid}.availabilitySchedule` (weekly hours) plus
`bookingRules` — and per-date exception docs at `instructors/{uid}/availability/{date}`. A
pure, Europe/Rome-aware slot engine (`slots.ts`) is shared by `getProviderSlots` (the booking
picker) and by `createBooking`, which enforces it inside a transaction that also takes a
provider-day lock at `instructors/{uid}/bookingDays/{date}` (server-only; no client access).

Every provider starts on the default weekly hours, Mon–Fri 09:00–17:00
(`DEFAULT_WEEKLY_HOURS`, defined once in `slots.ts`) — not "unbookable until they set hours".
`decideProviderApplication` (on approval) and the one-time `backfillAvailability` /
`backfillSelfRegisteredProviders` migrations write it onto `instructors/{uid}` when there is no
schedule yet; `availabilityUpdatedAt` is deliberately left unset until the provider saves on
`/provider/availability` themselves, which is what tells the dashboard whether to show the
"review your default hours" banner or leave the provider alone.

#### `getProviderSlots`
- **Type:** Callable
- **Auth:** Signed-in users only (a signed-out visitor sees a sign-in prompt on `/book` instead).
- **Parameters:** `{ instructorId: string, serviceId: string, date: string }` — `date` is `"YYYY-MM-DD"`, an Europe/Rome calendar day.
- **Returns:** `{ slots: { time: string, startsAt: string }[] }` — `time` is `"HH:mm"` Rome wall-clock; `startsAt` is that slot's real instant (ISO), which the client sends back as `createBooking`'s `scheduledAt`.
- **Purpose:** The free start times for one provider, service and day: the session must fit inside a bookable window, respect `bookingRules` (buffer, minimum advance notice, max bookings/day), and not overlap another active booking. Only checks instructor (trainer) services — venue bookings have no provider schedule.

#### `updateMyAvailability`
- **Type:** Callable
- **Auth:** The provider themselves (verified or pending `providerStatus`, or staff) — refuses `failed-precondition/no_instructor_profile` if they have no `instructors/{uid}` document (never creates a bare one).
- **Parameters:** `{ schedule: WeeklyWindow[], bookingRules: BookingRules, overrides: { upsert: OverrideDoc[], delete: string[] } }` — validated as a whole before any write (see `validate.ts` for the exact ranges: buffer 0–120min, notice 0–168h, max/day 1–50, ≤10 windows/day, ≤400 override writes/save).
- **Returns:** `{ windows: number, overridesWritten: number, overridesDeleted: number }`
- **Purpose:** The only writer of `instructors/{uid}.availabilitySchedule`, `.bookingRules`, `.availabilityUpdatedAt` and the per-date `availability/{date}` override docs (client writes to those are denied by `firestore.rules`).

#### `backfillAvailability`
- **Type:** Callable, dry-run by default (`{ dryRun?: boolean }`, defaults `true`)
- **Auth:** Superadmin only.
- **Purpose:** One-time migration. Moves the weekly hours the old profile editor wrote (`users/{uid}.providerProfile.availabilitySchedule`, a weekday map nothing ever booked against) onto `instructors/{uid}.availabilitySchedule`, then removes the users-side field. Never overwrites hours a provider has since saved on `/provider/availability` (`availabilityUpdatedAt` present). Afterward, every real provider (`providerStatus` verified or pending, not soft-deleted) still without a bookable schedule gets `DEFAULT_WEEKLY_HOURS` — counted separately as `defaultedHours` — without stamping `availabilityUpdatedAt`. Idempotent; writes an `audit_log` entry (`entityType: "migration"`, `entityId: "availability_backfill"`) when run for real.

---

## Recipes (`../../functions/src/recipes/`)

Added by P2-6 on 2026-08-09. Spec: `../superpowers/specs/2026-08-09-recipe-suggestions-design.md`.

#### `generateRecipes`
- **Type:** Callable, region `europe-west1`, `secrets: AI_SECRETS`.
- **Parameters:** `{ locale?: string; params: RecipeGenParams }`.
  `params` is closed enums (`dietStyle`, `excludes[]`, `orientation`, `cuisine`,
  `maxPrepMinutes`, `budget`, `servings`, `count`) plus optional `ingredientsOnHand: string[]`.
  The schema is `.strict()`: `kcalTarget`, `weightKg`, `measurements`, `condition` and
  `clientId` are **rejected**, not stripped.
- **Auth:** Any authenticated, non-deactivated user. Role determines quota only — a client
  generating for themselves is an intended use.
- **Purpose:** Produce 1–3 **generic** recipe suggestions and persist them to the top-level
  `recipes` collection with `sharedWithUserIds: []`.

**There is no `clientId` parameter, and there must never be one.** A recipe generated *for* a
named person, from their goals or measurements, is a personalized diet — reserved under Italian
law to *medici*, *biologi nutrizionisti* and *dietisti*. No code path in this module reads
client goals, bookings, names or measurements; the prompt is a pure function of the enums plus
the sanitized ingredient list. That absence is the primary guardrail. The output schema, which
cannot express a day, a week, a meal sequence or a target for a person, is the second. The
denylists are only the third.

Flow: validate params → screen `ingredientsOnHand` → check `systemSettings/aiAuthoring.enabled`
→ resolve role to quota → `reserveQuota` → build prompt → `generateObject` → screen output and
drop offenders → normalize survivors to `RECIPE_LIMITS` → batch-write → `writeAuditLog`
(`action: 'create'`, `entityType: 'recipe'`, with the kept and dropped counts). Every failure
path after the reservation calls `releaseQuota`.

**Size limits are enforced after parsing, never by the generation schema.** `generateObject`
validates all-or-nothing, so any maximum in the schema is a way for one cosmetic violation to
discard an entire batch — which is exactly what happened in production on 2026-08-10, when a
correct recipe carrying a seventh tag failed the whole generation. The schema now constrains
only the field set and types; `normalizeRecipe` clamps lengths, counts and ranges afterwards
and drops a recipe individually when a floor (two ingredients, two steps, a usable title)
cannot be met by truncating. Screening runs **before** normalization so truncation can never
hide a denied term. Do not reintroduce `.max()` on the generation schema.

- **Quota bucket:** `ai_recipes_usage`, deliberately separate from `ai_authoring_usage` so
  recipe generation cannot eat a trainer's workout-plan budget. One reservation per call.
  `provider`/`admin`/`superadmin` → `aiAuthoring.dailyQuota` (default 20); everyone else →
  `aiAuthoring.recipeClientDailyQuota` (default 3).
- **Input screening** (`screening.ts` → `validateIngredients`): max 6 items, each NFC-normalized
  then matched against a letters-only pattern — **no digits at all**, which kills "1500 kcal"
  and "80 kg" without enumerating them — then a diacritic-insensitive substring denylist of
  condition, weight and regime terms. Runs **before** `reserveQuota`, so a rejected attempt
  costs the user nothing.
- **Errors:** `invalid-argument` with message `forbidden-input:<term>` where `<term>` is
  `too-long`, `too-many-items`, `invalid-characters` or the matched denylist stem;
  `resource-exhausted / quota-exceeded`; `failed-precondition / disabled`;
  `internal / generation-unusable` when every generated recipe was screened out (quota
  released); `internal / persist-failed`.
- **Output screening** is a *narrower, separate* list from the input one and the two must not be
  merged. Nutrition per portion is permitted content and `cuisine: mediterranea` is an offered
  enum, so "tipico della dieta mediterranea" and "circa 300 calorie a porzione" must survive;
  bare `dieta`, `kcal`, `calorie` and `proteine` are allowed. What is caught: medical
  conditions, diagnosis framing, per-person prescription and clinical framing. Two tuning
  decisions are load-bearing and documented in `screening.ts` — the diagnosis stem is
  `allergi` and **not** `allerg`, because EU food labelling makes *allergeni* ordinary recipe
  vocabulary; and `cura per` was removed from the clinical row because it substring-matches the
  cooking idiom "mescolare con cura per 5 minuti". Do not re-add either.

#### `purgeLegacyNutritionData`
- **Type:** Callable, region `europe-west1`.
- **Parameters:** `{ dryRun?: boolean }` — **defaults to `true`**. An absent field, an empty
  payload or a missing `data` object deletes nothing.
- **Auth:** Superadmin only.
- **Purpose:** One-shot removal of every `clients/{id}/dietPlans` and `clients/{id}/recipes`
  document, which are the personalized-diet artifacts P2-6 exists to eliminate.
- **Behaviour:** collection-group scan of both groups; dry run returns counts and up to 20
  sample paths, writing nothing. A live run first writes every document verbatim with its path
  to `gs://<default-bucket>/legal-purge/nutrition-<ISO8601>.json`, verifies the object exists,
  then deletes in batches of 400, then writes one audit entry with both counts and the export
  path. **Export failure aborts before any delete** (`internal / export-failed`).
- **Trap:** `db.collectionGroup("recipes")` also matches the new **top-level** `recipes`
  collection that `generateRecipes` writes to. The callable filters on
  `path.startsWith("clients/")` and logs what it skipped. Do not remove that guard.
- Expected result on the production database: zero documents in either group.

### Removed by P2-6 (2026-08-09)

| Function | Why |
|---|---|
| `generateDietPlan` | Produced per-day meal plans from a `kcalTarget` — the artifact Italian law reserves to *medici*, *biologi nutrizionisti* and *dietisti* |
| `generateRecipe` (legacy singular) | Took a `clientId`, stored under `clients/{clientId}/recipes`, accepted `targetMacros`, and injected the client's goals and last five sessions into the prompt. Superseded by `generateRecipes` |

Deleting the source export is **not sufficient**: `firebase deploy --only functions` removes
functions missing from source only after an interactive confirmation that is skipped without a
TTY, so both callables would otherwise stay live and invokable with their old signatures. The
deploy step is therefore followed by:

```bash
firebase functions:delete generateDietPlan generateRecipe --region europe-west1 --force
```

`generateTrainingProgram` is unaffected — it is the pre-P2-5 workout generator and out of scope
here.

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

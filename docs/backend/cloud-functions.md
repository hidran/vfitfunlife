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
- **Description:** Registers FCM token for push notifications. Called by the client
  (`src/lib/push/fcmRegistration.ts`) on every sign-in / auth restore.

#### `unregisterFcmToken` (`notifications/tokens.ts`)
- **Type:** Callable
- **Parameters:** `{ token: string }`
- **Returns:** `{ success: true, removed: boolean }`
- **Description:** Removes one token from the caller's `fcmTokens`. The client calls it on
  logout, before signing out. Idempotent.

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

### Provider signup and business accounts (`../../functions/src/providers/`)

Companies (gyms, schools, studios) are providers with `providerType: 'business'`. Product behaviour is in [../features.md](../features.md#business-company-accounts); stored shapes in [../database-schema.md](../database-schema.md). All of these run in `europe-west1`.

#### `applyAsProvider` (`providers/applyAsProvider.ts`)
- **Type:** Callable (authenticated).
- **Input:**
  ```ts
  {
    categoryIds: string[];           // 1..30 service-taxonomy ids; only known leaves are kept
    fullName?: string;
    providerType?: 'individual' | 'business';   // absent => 'individual' (every pre-existing caller)
    business?: {                     // required when the account is, or becomes, a business
      legalName: string;             // ragione sociale, required, <= 120
      vatNumber: string;             // valid Italian P.IVA; normalised to 11 bare digits
      displayName: string;           // required, <= 120; copied to name/fullName
      description?: string;          // <= 2000
      website?: string | null;       // absolute http(s) URL, <= 300; stored as the parsed href
      city?: string;                 // <= 120
      venueType?: 'gym' | 'school' | 'studio' | 'none';  // default 'gym'
      address?: string | null;       // <= 200
    };
  }
  ```
  Validated field by field in `providers/businessApplication.ts` (`validateBusinessApplication`); every field is `typeof`-guarded because the payload comes straight from the client.
- **Result:** `{ success: true, providerId, status: 'verified' | 'pending', autoApproved: boolean, draftServicesSeeded: number }`. `status` is where the account stands after the call; `autoApproved` is true only when THIS call verified them.
- **Behaviour:**
  - *Individual:* unchanged. Verified on the spot when `systemSettings/providerOnboarding.autoApprove` is on (default), otherwise stored as pending.
  - *Business:* **always pending**, whatever `autoApprove` says. One transaction claims `businessVat/{vat}` (`providers/businessVatClaim.ts`) and writes the pending application: `users.providerStatus: 'pending'`, `users.providerType`, and on `instructors/{uid}` the `business` map as a **nested map** (never dotted keys, which `set(..., {merge: true})` would store literally), `providerType`, `name`/`fullName` = `displayName`. Re-applying with the same number by the same uid is idempotent; switching numbers releases the old claim.
- **Errors** (the HttpsError `message` is a stable code the client maps to a localised inline error, see `providerApplicationErrorFor` in `src/lib/businessDetails.ts`):

  | Code (`error.code`) | `message` |
  |---|---|
  | `invalid-argument` | `provider_type_invalid`, `business_required`, `business_vat_invalid`, `business_legal_name_required`, `business_legal_name_too_long`, `business_display_name_required`, `business_display_name_too_long`, `business_description_invalid`, `business_description_too_long`, `business_website_invalid`, `business_website_too_long`, `business_city_invalid`, `business_city_too_long`, `business_address_invalid`, `business_address_too_long`, `business_venue_type_invalid` |
  | `already-exists` | `business_vat_taken` (another uid holds the P.IVA) |
  | `failed-precondition` | `provider_type_locked` |
  | `unauthenticated` / `invalid-argument` | `Sign in required`; `Pick at least one category`, `categoryIds must be strings`, `Too many categories` |

- **Review-bypass rules** (so re-applying can never route around a review):
  - **Business lock:** an account that already is a business (stored `providerType` / `business`) stays one. Sending `providerType: 'individual'` without a business payload fails `provider_type_locked` instead of being treated as an individual and auto-approved; any other re-application is validated as a business (`business_required` when the payload is missing). A verified individual asking to become a business also fails `provider_type_locked` (conversion is an admin job).
  - **Rejected never auto-approves:** a rejected applicant is queued again whatever `autoApprove` says; only an admin reverses a rejection.
  - **Verified is a no-op:** an already verified account returns `{ status: 'verified', autoApproved: false }` and nothing is rewritten (legacy docs verified only through `providerProfile.isVerified` count too).
- Known and accepted: an unverified account can hold a P.IVA claim it has no right to (bounded to one claim per uid); an admin frees it with `releaseBusinessVat`.

#### `decideProviderApplication` (`providers/decideProviderApplication.ts`, logic in `providers/commitDecision.ts`)
- **Type:** Callable. **Auth:** admin or superadmin (`requireAdmin`).
- **Input:** `{ providerId, decision: 'verified' | 'rejected', notes? }`. **Result:** `{ success, providerId, decision, draftServicesSeeded, venueId }` (`venueId` is `null` unless a venue was created by this call).
- Approval promotes the role, sets default hours, seeds draft services and writes the audit entry in one batch (`commitProviderDecision`, shared with the auto-approval in `applyAsProvider`). For a company it never touches the `business` map and never blanks `name`/`fullName`.
- **Venue creation:** approving a business whose `venueType` is not `none` also `create`s `venues/biz_<uid>` in the same batch (`providers/businessVenue.ts`, `planBusinessVenue`): `{ name: business.displayName, type: venueType, address, city, ownerId: uid, partnerStatus: 'pending', isPartner: false, isActive: true, memberDiscountPercent: 0, partnerInstructorExtraPercent: 0, ... }`, with the owner's lat/lng copied when already saved, and links it back as the nested `business.venueId`. Approval is re-runnable: once `business.venueId` is set no second venue is planned.
- **`already-exists` / `venue_exists`:** the venue id is deterministic and written with `create`, so two racing approvals collide on it, as does a venue an admin already created at `biz_<uid>`. The **whole batch is refused** (nothing of the decision is written), so retrying after the clash is resolved is safe. The admin UI shows a localised message (`admin.providerDecision.error.venueExists`).
- Rejection releases nothing: a rejected company keeps its P.IVA claim.

#### `releaseBusinessVat` (`providers/releaseBusinessVat.ts`)
- **Type:** Callable. **Auth:** admin or superadmin.
- **Input:** `{ providerId, reason? }` (reason trimmed, max 500). **Result:** `{ success: true, providerId, vatNumber, released: boolean }`.
- Deletes `businessVat/{vat}` for the P.IVA on `instructors/{providerId}.business.vatNumber`, only when that claim belongs to `providerId`; the profile's number stays so the back office can still see what the company declared. The audit entry is written in the same transaction and only when something was released. Idempotent: an absent claim, or one held by another uid, returns `released: false` with no write.
- **Errors:** `unauthenticated`, `permission-denied` (`Admin required`), `invalid-argument` (`providerId is required`), `not-found` (`Provider not found`), `failed-precondition` (`business_vat_missing`).

#### `syncBusinessVenueLocation` (`providers/syncBusinessVenueLocation.ts`)
- **Type:** Firestore trigger (`onDocumentWritten` on `instructors/{instructorId}`, `retry: true`).
- Mirrors a business owner's saved location (lat/lng when valid and changed, city when non-empty and changed) onto `venues/{business.venueId}`. Venue writes are admin-only in the rules, hence the trigger. It writes the instructor's *current* location read fresh, so a retried or out-of-order event cannot put an older position over a newer one; an owner move overwrites an admin's hand edit of the venue's lat/lng/city. `update()` (never `set()`), so a deleted venue stays deleted. Writing lat/lng makes `syncVenueGeohash` recompute the geohash so the venue joins radius searches.

#### `onInstructorWriteSearchIndex` (`providers/onInstructorWriteSearchIndex.ts`)
- **Type:** Firestore trigger on `instructors/{instructorId}` (`retry: true`). Keeps `searchTerms` current (`providers/searchIndex.ts`); for a company the terms include `business.displayName` and `business.legalName`, placed before specialties so the 300-term cap never drops them. Backfill: `scripts/backfill-provider-search.mjs`.

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

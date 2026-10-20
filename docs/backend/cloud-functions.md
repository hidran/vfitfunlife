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
- **Legacy:** no client calls it. A company (`business` map on `instructors/{id}`, or
  `users.providerType === 'business'`) is refused with `failed-precondition` /
  `use_decide_provider_application` before any write, so it can't bypass the
  `expectedReview` and claim checks of `decideProviderApplication`. The guard and both
  verification writes are one transaction, so a company application landing in between is
  refused on Firestore's re-run instead of being listed.

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

### Provider applications & business accounts (`../../functions/src/providers/`)

Plan: `../plans/2026-10-04-business-accounts-plan.md`. A business (company or association) is a
provider with `users/{uid}.providerType: 'business'`, an `instructors/{uid}.business` map, and a
uniqueness claim `businessVat/{vatNumber}` (see `../database-schema.md`). Errors from these
callables carry a **stable code as the message** (e.g. `stale_review`), which the client maps to
localised text. All of them except `applyAsProvider` are admin **or** superadmin (`requireAdmin`; non-admins get
`permission-denied`), and every mutation writes its `audit_logs` entry in the same
transaction as the change. Each runs as one transaction that Firestore re-runs on contention;
contention outlasting its retries ⇒ `aborted` / `concurrent_update` (never `internal`).

#### `applyAsProvider`
- **Type:** Callable (`applyAsProvider.ts`, validators in `businessApplication.ts`), authenticated.
- **Parameters:** `{ categoryIds: string[] (1..30), fullName?, providerType?: 'individual' | 'business' (absent => individual), business?: { legalName, vatNumber, legalForm?, affiliationNumber?, displayName?, description?, website?, city?, venueType?, address? } }`. `vatNumber` is a P.IVA or an association's codice fiscale (11 digits + checksum; spaces and `IT` accepted, stored as bare digits); `legalForm` is `company | sole_trader | association | other` (absent => `company`); `affiliationNumber` <= 40; `displayName` <= 120 (defaults to the legal name); `description` <= 1000; `city` <= 80; `website` http(s) only, <= 200.
- **Venue fields (B12):** `venueType` is any venue type of the platform (`gym`, `wellness_center`, `spa`, `beauty_salon`, `school`, `studio`, `outdoor_space`, `event_space`) or `none`; **absent means `none`** (no premises, no venue on approval). Every type but `none` requires the `address` (<= 200) and the `city` server-side: `business_address_required`, `business_city_required`; for `none` the address is stored `null`. Unknown type: `invalid_venue_type`; bad address: `invalid_business_address`. The web form pre-selects `gym`. Only gym, school and studio host courses; a party venue, a beauty salon or a spa registers the same way and gets its own venue page. After signup `venueType`, `address` and `venueId` are frozen for the owner by the rules.
- **Returns:** `{ success, providerId, autoApproved?, draftServicesSeeded }` (`autoApproved` is true only when this call verified the account; absent when the account was already verified and nothing was written).
- **Behaviour:** an individual is verified on the spot when `systemSettings/providerOnboarding.autoApprove` is on (default), through `commitProviderDecision` with `selfApproval`. A company is **always pending**: one transaction claims `businessVat/{digits}` (releasing the uid's other claims) and writes `users.providerType`, `providerStatus` and, on `instructors/{uid}`, the `business` map as a nested map plus `name`/`fullName` = `displayName`.
- **Review-bypass rules (S-1):** a **rejected** applicant (or one a superadmin removed: `users.providerStatus: 'removed'` counts as rejected, never as verified) is queued as pending again whatever `autoApprove` says (only an admin reverses a no; `commitProviderDecision` re-checks with `selfApproval`, judged on its own transaction reads); an already **verified** account re-applying as an individual is a no-op; a verified individual cannot turn itself into a company (`failed-precondition` / `provider_type_locked`; the way back and forth is `convertBusinessToIndividual`); an existing business cannot re-apply as an individual (`business_account_exists`) and an approved one cannot re-apply at all (`business_already_approved`).
- **Errors:** `invalid-argument`: `invalid_vat`, `invalid_business`, `invalid_business_name`, `invalid_legal_form`, `invalid_affiliation_number`, `invalid_business_description`, `invalid_website`, `invalid_business_city`, `invalid_provider_type`, `invalid_venue_type`, `invalid_business_address`, `business_city_required`, `business_address_required` · `already-exists` / `vat_already_registered` · `failed-precondition`: `business_account_exists`, `business_already_approved`, `vat_change_not_allowed`, `provider_type_locked` · `aborted` / `concurrent_update`.

#### `decideProviderApplication`
- **Type:** Callable (`decideProviderApplication.ts`, the shared write is `commitDecision.ts`)
- **Parameters:** `{ providerId: string, decision: 'verified' | 'rejected', notes?: string, expectedReview?: { vatNumber: string, legalName: string, legalForm?: BusinessLegalForm | null, affiliationNumber?: string, venueType?: 'gym' | 'wellness_center' | 'spa' | 'beauty_salon' | 'school' | 'studio' | 'outdoor_space' | 'event_space' | 'none', address?: string | null } }`
- **Returns:** `{ success, providerId, decision, draftServicesSeeded, venueId }` (`venueId` is the venue created or reactivated by this call, else `null`)
- **Purpose:** Verify or reject a provider: sets `providerStatus`, the nested `providerProfile.isVerified` on both docs, promotes the role, seeds default hours and draft services on approval; audited as `provider` / `verify` (or `update` on rejection).
- **One transaction:** `commitProviderDecision` reads the users and instructors docs, the `businessVat` claim (company approvals) and whether services exist, computes every guard from those reads, then writes users, instructors (`set` with merge, nested maps), draft services and the audit entry. If anything it read changes before the commit, Firestore re-runs it on fresh reads — so no check can go stale before its write. A concurrent write that changes none of the reviewed facts (e.g. the search-index trigger rewriting `searchTerms`) only causes a re-run that passes. Contention that outlasts the SDK's retries ⇒ `aborted` / `concurrent_update`; a provider deleted mid-flight ⇒ `not-found` / `provider_not_found`; a protected superadmin ⇒ `permission-denied` / `protected_account`; an id that can't name a document ⇒ `invalid-argument` / `invalid_provider_id`.
- **Approve what was reviewed (B8, invariant I1):** approving a business (a `business` map on the instructors doc, or `users.providerType === 'business'`) requires `expectedReview` — the tax id, legal name, legal form and affiliation number the admin saw. The snapshot also carries the premises the venue will be built from, `venueType` and `address`. Older callers may omit legal form, affiliation, venue type and address only when the stored values are the defaults (`company`, an empty string, `none`, no address). Missing or malformed ⇒ `failed-precondition` / `review_required`; not equal to the stored values (tax id normalised, legal name trimmed and case-sensitive, legal form and affiliation compared exactly), or no `business` map to compare ⇒ `failed-precondition` / `stale_review`. A review sent for a provider that is not (any more) a company ⇒ `stale_review` too, whatever the decision. An individual who applies as a company while being approved ends in `review_required` on the re-run. The UI reloads the detail view and asks for a fresh review. Without a review, rejections and individuals' approvals pass.
- **Approval holds the tax-id claim (invariant I2):** a company is approved only if `businessVat/{its tax id}` exists and names it — else `failed-precondition` / `claim_missing` (released, e.g. after a rejection; the company must re-apply, or an admin sets its tax id again with `updateBusinessTaxId`) or `already-exists` / `vat_already_registered` (another account holds it). So releasing a rejected squatter's claim never lets it be approved alongside the real owner.

- **Venue on approval (B12, `businessVenue.ts` `planBusinessVenue`):** the same transaction also reads `venues/biz_<uid>` (a company only) and decides from it, so there is no window between the check and the write. Approving a company with any `venueType` but `none` **creates** `venues/biz_<uid>` with `tx.create` (never `set`): `{ name: business.displayName, slug, type: venueType, city, address, ownerId: uid, partnerStatus: 'pending', isPartner: false, isActive: true, memberDiscountPercent: 0, partnerInstructorExtraPercent: 0, rating: 0, reviewCount: 0, ... }`, copies lat/lng only when the provider already saved a valid location, and links it as the nested `instructors/{uid}.business.venueId` (never a dotted key). Re-approval **reactivates** the company's own venue only when the system had deactivated it (`deactivatedBy: 'lifecycle'`): a patch of `isActive` and `updatedAt` that also clears the marker (admin edits, photos and `partnerStatus` survive), and links `business.venueId` if it is empty. An active, linked venue is left alone; a venue an admin switched off by hand (no marker) stays off; a `business.venueId` that already points at another venue is kept; a venue whose link is set but whose document was deleted is not recreated. An absent or `none` venue type creates nothing, and neither does an individual.
- **Rejection** deactivates the company's own active venue (`isActive: false`, `deactivatedBy: 'lifecycle'`, `deactivatedAt`, `ownerId` kept for audit). The audit entry's `after` carries `venueId`, `venueReactivated` and `venueDeactivated` as applicable.
- **`already-exists` / `venue_exists`:** only for an unexpected clash: a venue at `biz_<uid>` owned by someone else, or a `create` that loses a race to another create. The whole transaction is refused (nothing of the decision is written), so retrying after the clash is resolved is safe. The admin UI maps it through `ADMIN_BUSINESS_ERRORS` (`admin.business.error.venueExists`).

#### `releaseBusinessVat`
- **Type:** Callable (`businessAdmin.ts`)
- **Parameters:** `{ vatNumber: string, reason?: string }` — P.IVA / codice fiscale; spaces and an `IT` prefix allowed.
- **Returns:** `{ success, vatNumber, releasedFrom: string | null }`
- **Purpose:** Free a tax-id claim (a rejected company's, or a squatter's) so the real owner can register. Refused while the claim's holder still has an instructors doc carrying that number that is not rejected — or is still listed (`applicationStatus === 'verified'` or `providerProfile.isVerified`), whatever its status says — use `convertBusinessToIndividual` or `updateBusinessTaxId` for a live company. The released company can't be approved afterwards (`claim_missing`) unless it takes the number again. Audited as `business_vat` / `delete` (`before` = the claim).
- **Errors:** `invalid-argument` / `invalid_vat` · `not-found` / `claim_not_found` · `failed-precondition` / `claim_in_use` · `invalid_reason`.

#### `convertBusinessToIndividual`
- **Type:** Callable (`businessAdmin.ts`)
- **Parameters:** `{ providerId: string, reason?: string }`
- **Returns:** `{ success, providerId, releasedClaims: string[] }`
- **Purpose:** Turn a company back into an individual (e.g. a sole trader who picked "Company" by mistake and is otherwise locked out of the individual path by `business_account_exists`). One transaction: deletes `users/{uid}.providerType` and the `instructors/{uid}.business` map with `FieldValue.delete()` (never null — the B4 rules would then block every owner edit), plus a denormalised `instructors.providerType` if present; deletes every `businessVat` claim with that `uid`; resets the public `name`/`fullName` to the user's personal `fullName` (kept as is if the user has none). Verification is unchanged — an approved company stays listed under the personal name. The company's venue (`venues/biz_<uid>`) is deactivated in the same transaction (`isActive: false`, `deactivatedBy: 'lifecycle'`, `ownerId` kept; audit `after.venueDeactivated`), so it leaves public listings; approving a company again reactivates it. An account converted this way is a verified individual: applying as a company again is refused with `provider_type_locked` until an admin rejects it first. Audited as `provider` / `update` (`before` = business map + claims).
- **Errors:** `invalid-argument` / `invalid_provider_id` · `not-found` / `provider_not_found` · `failed-precondition` / `not_a_business` · `permission-denied` / `protected_account` (protected superadmin) · `invalid_reason`.

#### `updateBusinessTaxId`
- **Type:** Callable (`businessAdmin.ts`)
- **Parameters:** `{ providerId: string, vatNumber: string, legalName?: string, legalForm?: 'company' | 'sole_trader' | 'association' | 'other' | null, affiliationNumber?: string | null, reason?: string }` — validated with the signup validators; the optional fields change only when sent (`null` resets `legalForm` to `company` / clears `affiliationNumber`).
- **Returns:** `{ success, providerId, vatNumber, releasedClaims: string[] }`
- **Purpose:** The only way to change a company's admin-owned fields after review (the owner can't — rules lock them — and a plain admin client write would leave the claim behind). One transaction: the new number must be unclaimed or already this uid's (`vat_already_registered`); when the number changes, no other instructors doc may carry it, claimed or not (e.g. a rejected company whose claim was released — query `instructors where business.vatNumber ==`, automatic single-field index) ⇒ `vat_carried_by_other` (convert that company or change its number first). Keeping the number while correcting legal data is never blocked by other carriers (after the S1 recovery the rejected squatter's doc still carries the owner's number); every other claim of the uid is released and the new one created; `instructors/{uid}.business` gets only the sent fields as a nested map (set with merge). The approval state is unchanged. Audited as `provider` / `update` (reviewed fields + claims before and after).
- **Errors:** `invalid-argument` / `invalid_vat`, `invalid_business_name`, `invalid_legal_form`, `invalid_affiliation_number`, `invalid_provider_id`, `invalid_reason` · `already-exists` / `vat_already_registered`, `vat_carried_by_other` · `failed-precondition` / `not_a_business`.

#### `syncBusinessVenueLocation`
- **Type:** Firestore trigger (`onDocumentWritten` on `instructors/{instructorId}`, `retry: true`; deploy with `--force`). Source: `syncBusinessVenueLocation.ts`.
- **Purpose:** a company's venue follows its owner. Venue writes are admin-only in the rules while the provider saves lat/lng/city (`saveMyLocation`) and renames the company (`business.displayName`) from the browser, so the copy happens here. The event only decides *what* to act on (`venueLocationPatch`: lat/lng when valid and changed, city when non-empty and changed; `venueNamePatch`: `business.displayName` changed to a non-empty value). What is written is the instructor's *current* values, read fresh, **field-precise**: only the announced parts, so a move does not rewrite a name an admin edited and a city-only change does not rewrite lat/lng. The display name becomes the venue `name`; the slug is minted once and never changes. Writing lat/lng makes `syncVenueGeohash` recompute the geohash so the venue joins radius searches. `update()`, never `set()`: a deleted venue stays deleted. An owner move or rename wins over an admin's hand edit of the same fields.

#### `onInstructorWriteSearchIndex`
- **Type:** Firestore trigger on `instructors/{instructorId}` (`providers/onInstructorWriteSearchIndex.ts`). Keeps `searchTerms` current (`providers/searchIndex.ts`); for a company the terms include `business.displayName` and `business.legalName`, right after the name and before specialties, so the 300-term cap never drops them. Backfill: `scripts/backfill-provider-search.mjs`.

#### User deletion (`../../functions/src/users/deleteUserCascade.ts`)
- `adminDeleteUser`, `adminBulkDeleteUsers` and `onAdminJobCreated` run the cascade: it deletes the `businessVat` claims the uid held and **deactivates** (never deletes) the company's own `venues/biz_<uid>` when its `ownerId` is that uid, marked `deactivatedBy: 'lifecycle'`, because a venue carries courses, sessions and bookings, which are kept records. Other venues whose `ownerId` is the uid (the manager of a partner gym) are not touched. `ownerId` stays for audit.

---

### Group courses (`../../functions/src/courses/`)

One engine for the group classes of individual providers and of gym, school and studio venues. Input, output and the complete error table of every callable: [api/reference.md](../api/reference.md#group-course-api). Documents: [database-schema.md](../database-schema.md#group-course-collections). The spaces callables live in `../../functions/src/venues/spaces.ts`. All callables are `onCall({ region })`, `europe-west1`; `cancelCourseEnrollment`, `manageCourseSession`, `cancelRemainingCourse`, `createCourseCheckout`, `maintainCourseEnrollments` and the webhook bind the `STRIPE_SECRET_KEY` secret (releasing a held Stripe seat expires its open Checkout Session, best effort).

| Module | What it owns |
|---|---|
| `core.ts` | `courseSchema`, `validateCourse`, `localInstant` (wall time to instant in a timezone; gap and ambiguous times are `invalid_local_time` / `ambiguous_local_time`), `generateSessions`, `assertReservable`, `allocatePrice`, `courseRevisionBumped`, `sessionRevisionBumped`, `checkoutActive` |
| `authority.ts` | `managesVenue(uid, venueId, tx?)`, `canManageCourse(uid, course, tx?)` returning `{uid, via: 'owner'\|'venue'\|'admin'}`; tx-aware |
| `locks.ts` | `courseScheduleLocks` helpers: `lockPaths`, `diffSlots`, `updateScheduleLocks(tx, remove, add)`, `slotsOf`, `MAX_LOCKED_SESSIONS = 400` |
| `pricing.ts` | Pure maths: `discountPercents`, `applyDiscount`, `quoteSeries`, `assertStripeAmount` (`STRIPE_MIN_CENTS = 50`) |
| `quote.ts` | `buildQuote(tx \| null, course, sessionIds, options)` and the `quoteCourse` callable |
| `enrollTx.ts` | `enrollInTx(tx, input)`: every read, then a `commit()` closure with every write |
| `enrollment.ts` | `enrollInCourse` / `enrollCourseParticipant`: argument parsing, payment-mode checks, one transaction around `enrollInTx` |
| `waitlist.ts` | Pure rules (`joinDecision`, `renumber`, `promotionWindowOpen`), `joinCourseWaitlist`, `leaveCourseWaitlist`, `removeFromWaitlist`, `planPromotions`, `clearWaitlistInTx`, `promoteWaitlist`; `WAITLIST_MAX = 100`, `PROMOTION_SCAN = 5`, `MAX_PROMOTION_SESSIONS_PER_TX = 25`, `PROMOTION_WRITE_BUDGET = 350` |
| `operations.ts` | `releaseEnrollment`, `cancelCourseEnrollment`, `recordCoursePayment`, `manageCourseSession`, `confirmCourseRefund`, `cancelRemainingCourse` |
| `index.ts` | `saveCourse`, `previewCourse` (and re-exports the rest) |
| `checkout.ts` | `createCourseCheckout`, `courseStripeWebhook`, late-payment refund branch |
| `maintenance.ts` | `maintainCourseEnrollments`, `remindCourseParticipants`, `sweepWaitlists`, `sweepElapsedLocks` |
| `providerEligibility.ts` | `onCourseProviderEligibility` / `syncCourseEligibility` |
| `notifications.ts` | `queueCourseNotification` and the `onCourseNotification` trigger |
| `participantInvitations.ts` | `notifyCourseParticipant` |

**Design rules every callable follows.**
- *No nested transactions.* Anything that must run inside another transaction takes a `Transaction` and returns a closure: `enrollInTx` (reads, then `commit()`), `planPromotions` (reads, then `apply()`), `clearWaitlistInTx` (reads, then a writer). A transaction does all its reads before its first write.
- *Authority once.* `canManageCourse` is resolved at callable entry and passed down as a `ReleaseActor` (`system`, `customer`, `manager`); `releaseEnrollment` never looks it up per participant.
- *Counters by increment.* Lesson `occupied`, `held`, `waitlisted` and the course's `nextAvailableSeats` move with `FieldValue.increment`, so several writes to one lesson in one transaction (a release plus a promotion into the same seat) compose; the promotion into a freed seat nets to zero.
- *Replay safe.* Enrollment ids are `sha256(uid:requestId)` (`sha256(actor:uid:requestId)` for staff bookings); a retried booking, join, promotion or cancellation changes nothing the second time. Notification outbox ids derive from the event.
- *The lock invariant.* A lock slot exists if and only if its course is published and its lesson is scheduled and has not ended. `saveCourse`, the lesson actions (`cancel`, `reschedule`, `substitute`), `cancelRemainingCourse` and archiving all update the slots in the same transaction as the lesson; `sweepElapsedLocks` removes slots of finished lessons. A test oracle (`lockInvariant.testutil.ts`) checks the invariant after every lifecycle test.
- *Quote then confirm.* `quoteCourse` is advisory; the booking transaction recomputes the price from the same `buildQuote` and compares it with the customer's `expectedFinalCents` and each lesson's `expectedRevisions` (`price_changed`).
- *Waitlist bounds.* A release tries the first `PROMOTION_SCAN` (5) entries per freed seat and at most 25 lessons per transaction within a 350-write budget; anything left is served by `promoteWaitlist` (loops single-seat transactions, at most 50) and by the five-minute sweep, which also repairs counters that drifted from their entries. Entries that can never be promoted leave with `waitlist_removed`; when a list is closed, `waitlist_cleared`.
- *Capacity never exceeded.* A promotion runs `enrollInTx` with the freed seats as `released`, so it passes the capacity check only for seats actually freed in that transaction.

**Callables added or changed by the unified model:** `saveCourse` (venue/space/instructor validation, forced timezone, snapshots, locks, revision), `previewCourse` (now returns `conflicts`), `quoteCourse` (new), `enrollInCourse` (priced, `expectedFinalCents` / `expectedRevisions`, `price_changed`, free bookings), `enrollCourseParticipant` (course authority, discount without price check), `notifyCourseParticipant` (takes `courseId`), `joinCourseWaitlist` and `leaveCourseWaitlist` (new), `manageCourseSession` (actions `reschedule` with `roomId`, `substitute`, `removeParticipant`, `removeWaitlistEntry`, `capacity`; `attendance` records no-shows), `cancelRemainingCourse` and `cancelCourseEnrollment` (venue staff, locks, waitlists, promotion), `confirmCourseRefund` / `recordCoursePayment` (venue staff), `saveGymSpace` and `configureGymInstructor` (moved from the partner-gym module; `saveGymSpace` now accepts venue staff).

**Triggers and schedules:** `maintainCourseEnrollments` (every 5 minutes), `remindCourseParticipants` (hourly), `onCourseNotification`, `onCourseProviderEligibility` (needs `--force` to redeploy, it has `retry: true`). Details of each are in the API reference section "Scheduled functions and triggers".

**Notifications.** Course notices use `bookingMessages.ts` templates in `it, en, es, fr, de` (type-enforced: a new event must have all five). New events: `waitlist_promoted`, `waitlist_promoted_hold`, `waitlist_cleared`, `waitlist_removed`, `instructor_changed`; tests in `functions/src/notifications/bookingMessages.test.ts`. Voice follows the existing templates: it informal, es "tu", fr "vous", de "du".

**Operations.**
- `node scripts/backfill-session-listed.mjs --project vfit-app-staging [--apply]` repairs `sessions.listed` for venue-linked courses (dry run by default); `--names` also copies the course name and timezone onto lessons written before `saveCourse` did.
- `node scripts/smoke-unified-courses-staging.mjs [--keep|--cleanup]` is the 25-check staging smoke (needs the demo accounts); `scripts/smoke-unified-courses-load-staging.mjs` runs the 400-lesson cancel and a 20-way waitlist burst against throwaway data.
- Emulator tests run outside the sandbox: `cd functions && npx firebase emulators:exec --only firestore --project demo-vfit "npx vitest run src/courses test/courses-rules.test.ts test/unified-courses-rules.test.ts"`; `RACE_ITERATIONS` sets the repeat count of the race suite (default 3, 10 before a release). Pure suites run with `npx vitest run src/courses/pricing.test.ts` and similar.

**The partner-gym module is removed.** The separate gym schedule, booking, payment and refund callables, their notification trigger and the six `gym*` collections no longer exist in code, rules or indexes (`saveGymSpace` and `configureGymInstructor` live on in `../../functions/src/venues/spaces.ts`). Each environment drops the deployed functions with the next `firebase deploy --only functions --force`; staging's leftover documents are deleted by `scripts/cleanup-gym-collections.mjs` (staging only, dry run by default).

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

Business type, reviewed legal fields and business verification cannot be changed by an admin browser client. Use the audited callables above; Firestore rules also protect superadmin clients. Display-field edits remain available.

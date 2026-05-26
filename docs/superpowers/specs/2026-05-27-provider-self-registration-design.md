# Provider Self-Registration ("Diventa un professionista")

**Date:** 2026-05-27
**Branch:** `main` (feature branch to be created)
**Status:** Design approved by user; ready for implementation plan

## Problem

Today every account is created with `role: "customer"` (`src/lib/firebase/auth.ts:278`, in `completeRegistration`). The only way to become a provider is for an admin to flip the role. There is no self-serve path for a user to say "I also want to offer services as a professional." We want users to opt in — at signup or later from their profile — and land in a **pending** state until an admin verifies them, at which point they become publicly bookable.

## Goals

- A user can opt in as a provider **at registration** (a toggle on the signup form) **and later** from their profile.
- Opting in is low-friction: we collect only the **intent + one provider type** (a service category). The full provider profile (bio, services, photos) is completed afterward in the existing provider dashboard.
- An opted-in user keeps full **customer** abilities and *additionally* becomes a **pending provider** (dual capability — `role` stays `customer`).
- A **pending** provider can reach the provider dashboard and set up their profile/services/photos, but is **hidden from public search and booking** until verified.
- An **admin** sees pending applications and can **verify** (go live) or **reject** them.
- Security: a user can submit/withdraw their own application but **cannot self-verify**. Only an admin can set the verified state.

## Non-goals

- Changing the single-`role` model. We do **not** introduce true multi-role; we layer a provider *status* on top of `role: customer`.
- Document/certificate upload or review workflow (the POC mentions certifications; out of scope here — verification is a manual admin decision).
- Re-application UX after rejection (rejected users see a contact-support message; no automated re-apply).
- Notifications/emails on status change (nice-to-have, not in this scope).
- Payments/payout onboarding (Stripe Connect) for providers.

## Architecture

### Data model

Two documents already exist per provider; we reuse both rather than inventing a third collection:

- **`users/{uid}`** — the auth/account doc the client loads via `authStore`. Add one field:
  ```ts
  providerStatus: 'none' | 'pending' | 'verified' | 'rejected'  // absent ⇒ 'none'
  ```
  `role` stays `'customer'`. This field drives **client-side UI gating** (showing the provider dashboard entry, the "in review" banner, the profile card state) without an extra read, since `users/{uid}` is already loaded.

- **`instructors/{uid}`** — the canonical, public provider profile that search reads (`searchProviders`/`fetchProviders` already filter `providerProfile.isVerified === true`). On opt-in we create this doc keyed by the user's uid with:
  ```ts
  {
    uid,                                   // owner link (used by rules)
    name: <user's fullName>,
    providerProfile: {
      isVerified: false,                   // the existing public-search gate
      specialties: [<chosen category name>],
      bio: '', rating: 0, reviewCount: 0,
    },
    applicationStatus: 'pending',          // NEW: 'pending' | 'verified' | 'rejected'
    createdAt, updatedAt,
  }
  ```
  `applicationStatus` and `providerProfile.isVerified` move together: verified ⇒ `isVerified: true`. `isVerified` remains the single search gate (no search changes needed).

**Why mirror status across two docs:** `users/{uid}` is the cheap, already-loaded source for UI; `instructors/{uid}` is the public/search source. To prevent drift, **both docs are written together in one `writeBatch`** on every mutation (opt-in, verify, reject). These are the *only* code paths that touch `providerStatus`/`applicationStatus`.

### Provider type options

The opt-in picker reuses the existing booking categories (`src/app/(main)/booking/page.tsx:31`) so the stored specialty matches what search filters on:

```
Personal Training · Yoga · Pilates · Massaggio · Nutrizione · Fisioterapia
```

We store the **Italian `name`** (e.g. `"Personal Training"`) as `providerProfile.specialties[0]`, consistent with how booking search matches specialties by name (`array-contains`). This list lives as a shared constant so the register form, profile card, and booking page can import it (extract `CATEGORIES` to `src/lib/serviceCategories.ts`).

### New data-layer module — `src/lib/firebase/providerApplication.ts`

Pure-ish helpers, all using a batched write across the two docs:

```ts
export type ProviderStatus = 'none' | 'pending' | 'verified' | 'rejected';

/** Owner opts in. Creates instructors/{uid} (pending, unverified) and sets users/{uid}.providerStatus='pending'. */
export async function submitProviderApplication(
  uid: string,
  opts: { fullName: string; categoryName: string }
): Promise<void>;

/** Admin decision. Sets instructors/{uid}.applicationStatus + providerProfile.isVerified and users/{uid}.providerStatus together. */
export async function setProviderApplicationStatus(
  uid: string,
  status: 'verified' | 'rejected'
): Promise<void>;
```

`submitProviderApplication` is idempotent-safe: if `instructors/{uid}` already exists it merges (does not reset an existing verified provider). Guard in the UI so it's only callable when `providerStatus === 'none'`.

### Hooks

- `useProviderStatus()` → reads `providerStatus` from the current `authStore.user` (no new fetch). Returns `'none' | 'pending' | 'verified' | 'rejected'`.
- `useSubmitProviderApplication()` → TanStack mutation wrapping `submitProviderApplication`; on success refreshes the auth user (`authStore.loadUserData(uid)`) so the UI reflects `pending` immediately.

### Flows

**A. Opt-in at signup** — `src/app/auth/register/page.tsx`
- Add a toggle "Voglio anche offrire servizi come professionista" (default **off**), placed near the interests selector.
- When **on**, reveal a single-select provider-type picker (the shared category list). The picker is required only when the toggle is on.
- On submit, after the existing `completeRegistration(...)` call: if the toggle is on, call `submitProviderApplication(uid, { fullName, categoryName })`. The user proceeds through the normal `/auth/permissions` onboarding as a customer who now has a pending application.

**B. Opt-in later** — profile (the existing personal-profile settings area on this branch)
- Add a "Diventa un professionista" card whose content depends on `providerStatus`:
  - `none` → button → opens a small modal/section with the type picker → `submitProviderApplication`.
  - `pending` → "La tua richiesta è in revisione" banner.
  - `verified` → link to `/provider/dashboard`.
  - `rejected` → "Richiesta non approvata — contatta il supporto."

**C. Pending provider experience** — `src/app/(main)/provider/layout.tsx`
- Add a guard: allow the provider area only when `providerStatus ∈ {pending, verified}`. Otherwise redirect to the profile page (or a "diventa professionista" prompt).
- When `pending`, render a persistent banner above the content: "Profilo in revisione — sarai visibile dopo l'approvazione." Provider can edit profile, services, gallery (all write to `instructors/{uid}`), which already works.
- Pending providers do **not** appear in search/booking because `isVerified` is still `false` (existing filter). **No search code changes.**

**D. Admin verification** — `src/app/admin/providers`
- Add an "In attesa" filter/section listing instructors where `applicationStatus === 'pending'`.
- Each pending entry has **Verifica** and **Rifiuta** actions calling `setProviderApplicationStatus(uid, 'verified' | 'rejected')`.
- Verify ⇒ `isVerified: true` + `applicationStatus: 'verified'` + `users.providerStatus: 'verified'` (batched). The provider now appears in search.

### Firestore security rules (`firestore.rules`)

The critical guarantee: **users cannot self-verify.**

- `isValidUserCreate()` (line 101): add `'providerStatus'` to the allowed key list so signup may include it.
- `isValidUserUpdate()` (line 117): add `'providerStatus'` to the allowed update keys (for opt-in-later).
- Add a constraint to the **owner** create/update branches: when the owner sets `providerStatus`, the value must be in `['none', 'pending']`. Setting `'verified'`/`'rejected'` requires `isAdmin()`. (New helper, e.g. `providerStatusSelfAllowed()`.)
- `match /instructors/{instructorId}` (line 272):
  - Split the current `allow write` into **create** and **update**:
    - **create**: `isAdmin()` OR (`isAuthenticated()` && `request.resource.data.uid == request.auth.uid` && self-write sets `providerProfile.isVerified == false` && `applicationStatus == 'pending'`).
    - **update**: `isAdmin()` OR (owner && the update does **not** set `providerProfile.isVerified` to `true` and does **not** set `applicationStatus` to `'verified'`). Use `.get(...)` defensively for optional nested fields.
  - Keep existing `services`/`availability`/`reviews` subcollection rules.

### Error handling

| Case | Behavior |
|---|---|
| Opt-in while already `pending`/`verified` | UI hides the opt-in control; `submitProviderApplication` merges, never downgrades a verified provider. |
| Toggle on at signup but no type chosen | Form validation blocks submit with an inline error. |
| Non-provider visits `/provider/*` | Layout guard redirects to profile. |
| Pending provider visits `/provider/*` | Allowed; sees "in review" banner. |
| Rejected user | Profile shows rejected state; provider area guard treats `rejected` like `none` (redirect). |
| Self-write attempts `isVerified: true` | Rejected by Firestore rules. |

## Testing

- **Unit (Vitest):**
  - `submitProviderApplication` builds the correct batched writes (instructors doc shape with `isVerified:false`, `applicationStatus:'pending'`; user `providerStatus:'pending'`). Mock Firestore batch.
  - `setProviderApplicationStatus('verified')` sets `isVerified:true` + both statuses; `('rejected')` sets `rejected` and leaves `isVerified:false`.
  - Status-derived UI helper (e.g. a `providerCardState(status)` pure function) returns the right variant for each status.
- **Rules:** no automated harness in repo; verify manually with the emulator/console that a non-admin cannot set `isVerified:true` or `providerStatus:'verified'`.
- **Manual / e2e (deployed or local):**
  1. Register with the toggle on + pick a type → `providerStatus: pending`, `instructors/{uid}` created unverified.
  2. Confirm the new provider does **not** appear in `/booking` search.
  3. Provider area is reachable and shows the "in review" banner; can add a service/photo.
  4. As admin, verify the application → provider appears in search; banner clears; `/provider/dashboard` linked from profile.
  5. Reject path shows the rejected state.

## Implementation ordering (detailed in writing-plans)

1. Extract shared `serviceCategories.ts`; add `providerStatus` to `User` type and `applicationStatus` to the instructor/provider type.
2. `providerApplication.ts` helpers + unit tests.
3. `useProviderStatus` / `useSubmitProviderApplication` hooks.
4. Firestore rules: user key whitelists + self-status constraint + instructors create/update split.
5. Register form: toggle + type picker + opt-in call.
6. Profile "Diventa un professionista" card (status-driven).
7. Provider layout guard + pending banner.
8. Admin pending queue + verify/reject actions.
9. Verify: tests, build, manual e2e per above.

## Risks

| Risk | Mitigation |
|---|---|
| `providerStatus` on `users` drifts from `instructors.applicationStatus` | Every mutation writes both in one `writeBatch`; these are the only writers. |
| New `providerStatus` key breaks `isValidUserCreate`/`isValidUserUpdate` (writes rejected) | Add the key to both whitelists in the same change that starts writing it. |
| Self-verification via direct Firestore write | Rules forbid non-admins from setting `isVerified:true` / status `verified`; covered by manual rules check. |
| Existing seeded instructors lack `applicationStatus` | Treat missing `applicationStatus` as already-live (verified seed data has `isVerified:true`); admin pending query filters `applicationStatus == 'pending'` only, so legacy docs are unaffected. |
| `completeRegistration` create-rule whitelist is strict | Spec adds `providerStatus` to the whitelist; the signup write only includes it when opting in (else omitted/`none`). |

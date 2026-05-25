# Fake Data → Firestore Migration

**Date:** 2026-05-24
**Branch:** `cycle/c1-personal-profile`
**Status:** Design approved, ready for implementation plan

## Problem

The app has several pockets of hardcoded "fake data" that masquerade as the real domain model. Today this causes a concrete runtime bug: the home page fetches real venues from Firestore and links to `/venue/${firestoreId}/`, but `venue/[id]/page.tsx` only declares `carosello` and `urban-core` in `generateStaticParams()` with `dynamicParams=false`. Any link to a real Firestore venue produces `Page "/(main)/venue/[id]/page" is missing param ... in "generateStaticParams()"`.

Beyond that one symptom, the fake-data surfaces drift from the actual schema, can't be edited without redeploys, and make the venue/booking/admin screens unable to render anything but two demo entries.

## Goals

- All true domain data (venues, providers, classes) sourced from Firestore at runtime, cached client-side.
- No build-time list of "valid" IDs. Adding a new venue in Firestore makes the corresponding `/venue/{id}` URL work immediately, without a rebuild.
- Existing `carosello` / `urban-core` content preserved as seeded Firestore documents so the app keeps working in dev environments.
- Type-safe data access through a small set of shared hooks; eliminate inline `useVenuesByType`-style hooks scattered across pages.

## Non-goals

- UI-config files (`featureRouteContent.ts`, `NotificationSettings` options, `SocialLinksEditor` platforms, `onboarding/page.tsx` slides). These bind to Lucide React components and i18n keys; moving them to Firestore would lose compile-time safety and add a fetch with no editorial benefit.
- Real-time `onSnapshot` subscriptions. All reads are one-shot `getDoc` / `getDocs` cached by TanStack Query. Realtime can be added per-hook later.
- Other dynamic routes (`chat/[id]`, `bookings/[id]`) — out of scope; they have their own mock-data concerns to address separately.
- Production Firestore content. Seeding only targets demo/dev environments and is gated to admin/superadmin users by the existing seeder infrastructure.

## How `output: 'export'` interacts with dynamic data

Next 16's `next build` *requires* `generateStaticParams()` on every dynamic route under `output: 'export'`, but the returned list does not have to be the real domain IDs. The codebase already uses a placeholder pattern in `chat/[id]`, `bookings/[id]`, `provider/[id]`:

```ts
export const dynamicParams = false;
export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}
```

The build emits one shell HTML (e.g. `out/venue/placeholder/index.html`). `firebase.json` already declares a catch-all rewrite `"**" → "/index.html"`, so any URL like `/venue/carosello/` is served the same shell. The Next client router then routes to `/venue/[id]`, the client component reads the real ID via `useParams()`, and fetches from Firestore. **No build-time Firestore read needed; no rebuild required to add a venue.**

`venue/[id]/page.tsx` is the only dynamic route in the app not yet on this pattern. Aligning it is the first step of the migration.

## Architecture

### Build time (per `next build`)

| Concern | Behavior |
|---|---|
| `generateStaticParams()` | Returns `[{id: 'placeholder'}]` (or matching param name) for every dynamic route. |
| Output | One shell HTML per route. Identical structure to other existing dynamic routes. |
| Firebase Admin SDK | Not used. Build needs no service-account credentials. |

### Runtime (per page view)

| Concern | Behavior |
|---|---|
| URL routing | Hosting catch-all rewrite → `/index.html` → Next client router → matching `[id]` route. |
| Data fetch | Client component reads ID via `useParams()`, calls a typed hook (e.g. `useVenue(id)`). |
| Caching | TanStack Query keyed on `['venue', id]`, `staleTime: 5*60_000`. Revisits within 5min do not refetch. |
| Loading state | Existing `<Spinner />` while `query.isLoading`. |
| Not-found | When `fetchVenue(id)` resolves to `null`, render an inline "Venue not found" panel (no full-page 404). |
| Auth | Read access governed by `firestore.rules`; venues collection is publicly readable (current rule). |

## Data layer

### New file `src/lib/firebase/venues.ts`

Typed accessors. No React, no hooks — pure Firestore reads.

```ts
import type { Venue, VenueService, VenueCourse, VenueType } from '@/types/venue';

export async function fetchVenue(id: string): Promise<Venue | null>;
export async function fetchVenues(opts?: {
  type?: VenueType;
  city?: string;
  limit?: number;
}): Promise<Venue[]>;
export async function fetchVenueServices(venueId: string): Promise<VenueService[]>;
export async function fetchVenueCourses(venueId: string): Promise<VenueCourse[]>;
```

### New file `src/lib/firebase/providers.ts`

Reads from the existing `/instructors/{id}` collection (the public provider profile mirror — `home/page.tsx:184` already queries this). Not `/users/{id}` (private) or `/providers/` (doesn't exist).

```ts
export async function fetchProvider(id: string): Promise<Provider | null>;
export async function fetchProviders(opts?: { limit?: number; specialty?: string }): Promise<Provider[]>;
export async function fetchProviderServices(providerId: string): Promise<ProviderService[]>;
```

Services for a provider live in `/instructors/{id}/services/{serviceId}` — confirmed by `MOCK_PROVIDER.services` shape in `BookingClient.tsx:38`.

### New hooks: `src/hooks/useVenues.ts`, `src/hooks/useProviders.ts`

Thin TanStack Query wrappers:

```ts
export function useVenue(id: string | undefined) {
  return useQuery({
    queryKey: ['venue', id],
    queryFn: () => fetchVenue(id!),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });
}

export function useVenues(opts?: VenueListOptions) {
  return useQuery({
    queryKey: ['venues', opts],
    queryFn: () => fetchVenues(opts),
    staleTime: 5 * 60_000,
  });
}
```

Re-exported from `src/hooks/index.ts`.

### Removed: scattered inline hooks

`home/page.tsx` currently defines `useVenuesByType`, `useTopProviders`, `useTodayClasses`, `useTestimonials` inline (`useState` + `useEffect` + direct Firestore calls). These collapse into the shared TanStack hooks (`useVenues`, `useProviders`, `useClasses`, `useTestimonials`). Net deletion of ~150 lines from `home/page.tsx`.

## Types

New `src/types/venue.ts`:

```ts
export type VenueType = 'gym' | 'wellness_center' | 'spa' | 'beauty_salon';

export type AmenityKind =
  | 'sala_pesi' | 'wifi' | 'parcheggio' | 'docce' | 'sauna'
  | 'pool' | 'crossfit' | 'boxing' | 'yoga' | 'pilates'
  | 'spa' | 'tennis' | 'weights' | 'cardio';

export interface Venue {
  id: string;
  name: string;
  slug: string;
  type: VenueType;
  city: string;
  address: string;
  lat: number;
  lng: number;
  rating: number;
  reviewCount: number;
  isPartner: boolean;
  isActive: boolean;
  description: string;
  heroGradients: string[];
  amenities: AmenityRef[];
  hours: VenueHours[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AmenityRef { kind: AmenityKind; labelKey?: string }
export interface VenueHours { day: string; time: string }
export interface VenueService { id: string; name: string; price: number; durationMinutes?: number; description?: string; isActive: boolean }
export interface VenueCourse { id: string; name: string; time: string; coach: string; spots: number; dayOfWeek?: number }
```

## Icon registry

New `src/lib/icons/amenityIcons.ts`:

```ts
import { Dumbbell, Wifi, Car, Droplet, /* ... */ } from 'lucide-react';
import type { AmenityKind } from '@/types/venue';

export const AMENITY_ICONS: Record<AmenityKind, LucideIcon> = {
  sala_pesi: Dumbbell,
  wifi: Wifi,
  parcheggio: Car,
  docce: Droplet,
  // …
};
```

`VenueDetailClient.tsx` looks up `AMENITY_ICONS[amenity.kind]` instead of receiving icon components from data. Same pattern used today implicitly in `data.ts` (where `icon: Dumbbell` is hand-assigned); we just centralize the table.

## Firestore schema

Aligned with `docs/database-schema.md`:

```
/venues/{id}                    ← doc
  name, slug, type, city, address, lat, lng,
  rating, reviewCount, isPartner, isActive,
  description, heroGradients, amenities[], hours[],
  createdAt, updatedAtmpc

/venues/{id}/services/{serviceId}     ← subcollection
  name, price, durationMinutes?, description?, isActive

/venues/{id}/courses/{courseId}       ← subcollection
  name, time, coach, spots, dayOfWeek
```

Rationale for subcollections: services and courses can grow per venue and are fetched independently on the detail page (separate `useVenueServices(id)` query so the main venue card can render before the service list resolves). Amenities and hours stay embedded (small, always rendered with the venue card).

## Seeding

Extend `functions/src/seed/seedData.ts` with two new idempotent steps:

**`seedSampleVenues()`** — writes deterministic demo venues:
- Fixed IDs: `carosello`, `urban-core` (from current `data.ts`), plus `village-fit`, `pulse-studio`, `elite-fitness`, `power-gym` (from `fit/gyms/page.tsx` inline list).
- Uses `set(..., { merge: true })` so reseeding is safe.
- Writes `/venues/{id}` doc + `/venues/{id}/services/{svc-N}` + `/venues/{id}/courses/{course-N}` with deterministic subdocument IDs.
- Source content is copied into the seed function as a one-time constant (so the deletion of `data.ts` doesn't break seeding).

**`seedSampleInstructors()`** — writes one demo provider matching `MOCK_PROVIDER`:
- Fixed ID: `provider-1`.
- Writes `/instructors/{provider-1}` + `/instructors/{id}/services/{svc-1..N}`.
- Same idempotent merge pattern.

Both are called from the existing `seedQuickData` HTTP endpoint (admin-gated). The existing randomized `seedVenues(count)` stays untouched — the new functions are additive and named distinctly.

A local convenience npm script `npm run seed:sample` in `functions/package.json` (uses `firebase-admin` against the emulator) runs the same functions for local dev. Optional for v1 if the HTTP endpoint suffices.

## Files changed

### New
- `src/lib/firebase/venues.ts` — typed Firestore accessors
- `src/lib/firebase/providers.ts` — typed Firestore accessors
- `src/hooks/useVenues.ts` — TanStack Query hooks
- `src/hooks/useProviders.ts` — TanStack Query hooks
- `src/types/venue.ts` — Venue/Service/Course/AmenityKind types
- `src/types/instructor.ts` — `Provider` / `ProviderService` types for the customer-facing `/instructors` collection. (`src/types/provider.ts` exists but covers the provider-dashboard concerns — keep separate to avoid coupling read models.)
- `src/lib/icons/amenityIcons.ts` — AmenityKind → Lucide registry
- `src/components/venue/VenueNotFound.tsx` — inline 404 panel

### Modified
- `src/app/(main)/venue/[id]/page.tsx` — use placeholder `generateStaticParams`
- `src/app/(main)/venue/[id]/VenueDetailClient.tsx` — `useParams()` + `useVenue()` + `useVenueServices()` + `useVenueCourses()`; map amenity icons via registry
- `src/app/(main)/fit/gyms/page.tsx` — replace inline `gyms = [...]` with `useVenues({ type: 'gym' })`
- `src/app/booking/[providerId]/BookingClient.tsx` — replace `MOCK_PROVIDER` with `useProvider(providerId)` + `useProviderServices(providerId)`
- `src/app/admin/venues/page.tsx` — replace mock array with `useVenues({})` (paginated admin view)
- `src/app/(main)/home/page.tsx` — refactor inline `useVenuesByType` / `useTopProviders` / `useTodayClasses` / `useTestimonials` to use shared hooks
- `src/hooks/index.ts` — re-export new hooks
- `functions/src/seed/seedData.ts` — add `seedSampleVenues()` and call from `seedQuickData`
- `docs/database-schema.md` — note services/courses subcollection details if not already there (verify before editing)

### Deleted
- `src/app/(main)/venue/[id]/data.ts`
- `src/lib/mockData.ts`

## Loading & error UX

| State | Behavior |
|---|---|
| Initial load | `<Spinner size="md" />` in the venue hero placeholder; existing skeleton CSS classes reused. |
| Venue not found | `<VenueNotFound />` card with "Browse gyms" CTA back to `/fit/gyms`. No full-page 404 — keeps the bottom nav and chrome visible. |
| Firestore error | Same not-found card with a "Retry" button calling `query.refetch()`. Toast notification for transient errors. |
| Stale + revalidating | TanStack default: show cached venue, no spinner. Acceptable since the schema rarely changes. |
| Offline | Firestore SDK serves last cached doc from IndexedDB; same UX as online. Already enabled by `enableIndexedDbPersistence()` in `src/lib/firebase/config.ts`. |

## Security

Current state of `firestore.rules` (verified during spec review):

| Path | Read | Write |
|---|---|---|
| `/venues/{venueId}` | ✅ `allow read: if true` | admin or venue staff |
| `/venues/{id}/services/{serviceId}` | ✅ `allow read: if true` | admin or venue staff |
| `/venues/{id}/reviews/{reviewId}` | ✅ `allow read: if true` | authenticated create only |
| `/venues/{id}/courses/{courseId}` | ❌ **rule missing** | ❌ rule missing |
| `/instructors/{instructorId}` | _not yet verified_ — confirm during step 0 | _not yet verified_ |
| `/instructors/{id}/services/{serviceId}` | _not yet verified_ | _not yet verified_ |

Step 0 of the implementation plan must add the missing `courses` rule (public read; admin/venue-staff write) and verify `instructors` rules permit public read of profile + services. Without these, the page fetches silently return empty results in dev (where the user is unauthenticated).

Seeder remains admin-only (existing `isAdmin()` check unchanged).

## Testing

- New unit tests for `fetchVenue` / `fetchVenues` against Firestore emulator (mirror style of existing `firebookings.test.ts` if present, else use jest with mocked firestore client).
- New unit tests for `useVenue` hook (TanStack Query in test mode with `wrapper`).
- Update `e2e/venue.spec.ts`:
  - Seed Firestore via the emulator before tests
  - Assert venue page renders the seeded name (not the hardcoded "Carosello Fitness" string literal — instead read from the seeded doc).
  - Add a test for "unknown venue ID shows Not Found panel".
- No new tests for the deleted `mockData.ts` (it had no consumers, no tests).

## Migration ordering

The plan will be detailed by `writing-plans`, but the high-level sequence is:

0. **Firestore rules audit.** Add the missing `/venues/{id}/courses/{courseId}` rule. Verify `/instructors/{id}` and `/instructors/{id}/services/{serviceId}` permit public read. Deploy rules to dev project. (Blocks every subsequent step.)
1. Build the data layer (types, accessors, hooks, icon registry) with no behavior changes.
2. Extend the seeder and run it locally against the emulator to confirm the seeded docs render with the new hooks via a one-off test page.
3. Migrate `venue/[id]` (highest risk: paired with the open runtime error). Verify dev + e2e.
4. Migrate `fit/gyms`, `booking/[providerId]`, `admin/venues` in sequence.
5. Refactor `home/page.tsx` inline hooks last (lowest risk; just consolidation).
6. Delete `data.ts` and `mockData.ts`. Verify build.
7. Update `docs/database-schema.md` if any schema clar
ifications emerged during implementation.

Each step is its own commit with passing build + tests.

## Risks

| Risk | Mitigation |
|---|---|
| Missing `/venues/{id}/courses/{courseId}` rule and unverified `/instructors/{id}` rules cause silent empty reads in dev | Step 0 of the plan deploys updated rules with public read for venue courses + verified public read for instructor profiles. Smoke test queries from an unauthenticated session before proceeding. |
| Seeder breaks for someone without admin role | Existing `isAdmin()` check is unchanged. Dev seeder path uses emulator (no auth) — document in README. |
| AmenityKind registry misses an amenity → render breaks | Registry returns a default icon (`HelpCircle`) and logs a console warning. Lint check enforces every `AmenityKind` is covered. |
| Hydration mismatch (already present unrelated to this task) | Out of scope; flagged in current dev console but does not affect data correctness. |
| `home/page.tsx` refactor regresses an existing card | Refactor is mechanical (replace one hook with another, same return shape). Existing visual tests + manual smoke. |

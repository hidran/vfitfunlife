# Bookable VFun Activities

**Date:** 2026-05-27
**Branch:** `main`
**Status:** Design approved by user; ready for implementation plan

## Problem

In the VFun area (`src/components/screens/FunRouteScreen.tsx`, rendered by `/fun/[slug]`), the "book" buttons on events, VR experiences, and party packages are hardcoded `<Link href="/booking">` placeholders (lines ~402, ~444, ~627). Clicking "book" on any activity dumps the user into the generic trainer **search** page instead of booking that activity. Root cause: the activities are static, i18n-keyed demo arrays with no Firestore entity and no booking destination — the only booking flow that exists is provider-based (`/book?providerId=` → `createBooking(providerId, serviceId, scheduledAt)` against `/instructors`).

## Goals

- VFun events, VR experiences, and party packages are **real bookable entities** in Firestore.
- Clicking "book" on an activity opens **that activity's booking screen** and produces a persisted booking — reusing the existing provider/service booking flow with no booking-code changes.
- The VFun screen loads activities **from Firestore** (not static arrays), matching the app's "everything dynamic from Firestore" principle.
- Fun activities **never appear in the trainer search / "find a coach"** lists.

## Non-goals

- A bespoke event-ticketing UX (fixed-date display, ticket-quantity selector). Per the chosen approach, activities reuse the existing `/book` screen as-is (the trainer-style date/time picker shows even for fixed-date events — a known minor UX wart to refine later).
- Real payments/ticket inventory, attendee caps enforcement, or party quoting workflow.
- Making TV/streaming shows bookable (they remain streaming-only).
- Translating activity names/locations (dynamic Firestore content, like provider/service names, is not run through i18n).

## Architecture

### Data model — activities live in `/instructors`

Each fun activity is a doc in the existing `/instructors` collection so the existing `/book?providerId=` + `createBooking` flow works unchanged. Distinguished from real trainers by a discriminator field.

Extend `Provider` (`src/types/instructor.ts`) with optional activity fields:
```ts
export type ActivityKind = 'event' | 'vr' | 'party';
// added to Provider:
activityKind?: ActivityKind;        // absent ⇒ a real trainer
eventDate?: string;                 // events: e.g. "16 Feb"
eventTime?: string;                 // events: e.g. "18:30"
location?: string;                  // events: display location
attendees?: number;                 // events
tag?: 'hot' | 'vip' | 'new';        // events
durationMinutes?: number;           // vr (already on InstructorService; here for activity card)
partyType?: string;                 // party: e.g. "private" | "corporate" | "birthday"
```
`flattenProvider` maps these (defensive: `activityKind: (data.activityKind as ActivityKind) ?? undefined`, etc.).

Each activity doc carries `providerProfile.isVerified: true`, `isActive: true`, a `fullName`/`name` (the activity title), an `avatarUrl` (cover image), `lowestPrice` (denormalized), and exactly one `services/{serviceId}` subdoc representing the bookable ticket/session/package (`name`, `price`, `durationMinutes`, `isActive: true`). `createBooking` reads this service unchanged.

### Trainer-search exclusion (critical)

Because `/instructors` is read by the trainer search and the home "find a coach" list, activities must be filtered out of those paths:
- `searchProviders` (`src/lib/firebookings.ts`): after fetching, drop docs whose raw `data.activityKind` is set — `snapshot.docs.filter((d) => !d.data().activityKind)` before mapping. (The `isVerified == true` query still matches activities, so the in-memory exclusion is required.)
- `fetchProviders` (`src/lib/firebase/providers.ts`): the `Provider` objects now carry `activityKind`; add `.filter((p) => !p.activityKind)` to the existing filter chain.
- Treat **missing** `activityKind` as a trainer (so all existing trainers are unaffected).

### Reading activities — `fetchFunActivities` + `useFunActivities`

- `src/lib/firebase/providers.ts`: `fetchFunActivities(kind: ActivityKind): Promise<Provider[]>` → query `/instructors` where `activityKind == kind`, map via `flattenProvider`, filter `isActive`. (Single-field equality query; no composite index needed.)
- `src/hooks/useFunActivities.ts` (new): `useFunActivities(kind)` → `useQuery({ queryKey: ['fun-activities', kind], queryFn: () => fetchFunActivities(kind), staleTime: 5*60_000 })`.

### VFun screen becomes data-driven — `FunRouteScreen.tsx`

- Replace the static `upcomingEvents`, `vrExperiences`, and party-package arrays with `useFunActivities('event')` / `useFunActivities('vr')` / `useFunActivities('party')`.
- Render the same card layouts, reading fields from the fetched `Provider` objects (title = `fullName`, plus `eventDate`/`eventTime`/`location`/`attendees`/`tag`, `lowestPrice`, `durationMinutes`, `partyType`). Activity titles/locations are now dynamic strings (not i18n keys); the surrounding chrome (stats, filters, "book"/"book ticket" button labels, headings) stays translated via the existing keys.
- Add loading + empty states per section (reuse `common.loading` and the existing `funRoute.*.empty` keys).
- Each book CTA becomes `<Link href={`/book?providerId=${activity.id}`}>` (events line ~402, VR line ~444; the events-section footer "tickets" CTA line ~627 can link to `/fun/events` or stay — decide at implementation, but per-card CTAs must route by id).

### Booking — reuse `/book` unchanged

No changes to `BookingClient` or `createBooking`. `/book?providerId=<activityId>` loads the activity via `useProvider`, its single service via `useProviderServices`, and books it via `createBooking(providerId=activityId, serviceId, scheduledAt)`. The booking persists like any provider booking.

### Seeding — `generateDemoFunActivities()` + runner

- `functions/src/seed/seedData.ts`: add `generateDemoFunActivities()` creating the 4 events, 4 VR experiences, and ~3 party packages (using the same names/prices/metadata currently hardcoded in `FunRouteScreen`) as `/instructors/{id}` docs with `activityKind` + metadata + `providerProfile.isVerified:true` + `isActive:true` + a denormalized `lowestPrice`, each with one `services/{serviceId}` subdoc. Idempotent (deterministic ids, `set` with merge). Returns a count summary.
- `functions/scripts/run-seed-fun.mjs`: mirrors `run-seed-demo.mjs` (init admin with `projectId: 'vfit-funlife'`, import compiled `../lib/seed/seedData.js`, call `generateDemoFunActivities()`).
- Run locally after build: `cd functions && npm run build` then `GOOGLE_APPLICATION_CREDENTIALS=~/.config/firebase-cli-adc.json GOOGLE_CLOUD_PROJECT=vfit-funlife node functions/scripts/run-seed-fun.mjs` (matches how other seeds run).

## Components / files

- Modify: `src/types/instructor.ts` (ActivityKind + Provider fields)
- Modify: `src/lib/firebase/providers.ts` (`flattenProvider` mapping; `fetchProviders` exclusion; new `fetchFunActivities`)
- Modify: `src/lib/firebookings.ts` (`searchProviders` exclusion)
- Create: `src/hooks/useFunActivities.ts`
- Modify: `src/components/screens/FunRouteScreen.tsx` (data-driven sections + routed CTAs)
- Modify: `functions/src/seed/seedData.ts` (`generateDemoFunActivities`)
- Create: `functions/scripts/run-seed-fun.mjs`
- Tests: `src/lib/firebase/providers.test.ts` (exclusion + `fetchFunActivities` cases), `src/lib/firebookings.test.ts` (search exclusion — create if absent, else add)

## Error handling

| Case | Behavior |
|---|---|
| No activities of a kind seeded | Section shows its empty state. |
| `/book?providerId=<activity>` with bad/missing id | Existing not-found panel in `BookingClient`. |
| Activity doc missing its service subdoc | `createBooking` throws "Service not found" (existing); seed must always create the service. |
| Activity leaks into trainer search | Prevented by the `activityKind` exclusion in both `searchProviders` and `fetchProviders`. |
| Legacy trainers without `activityKind` | Treated as trainers (filter is `!activityKind`); unaffected. |

## Testing

- **Unit (`providers.test.ts`):** `fetchProviders` excludes a doc with `activityKind: 'event'`; `fetchFunActivities('event')` returns only event-kind docs and maps activity fields; `flattenProvider` maps `activityKind`/`eventDate`/`tag`.
- **Unit (`firebookings.test.ts`):** `searchProviders` result excludes an `activityKind` doc even though it is `isVerified`.
- **Manual e2e (dev server + vfit-funlife):** after seeding — VFun events/VR/parties render from Firestore; clicking book on an event opens `/book?providerId=<id>` showing that activity + its service; completing the flow persists a booking; the trainer search (`/booking`) and home "find a coach" show **no** activities.

## Implementation ordering (for writing-plans)

1. Types: `ActivityKind` + `Provider` activity fields; `flattenProvider` mapping.
2. Search/list exclusion in `searchProviders` + `fetchProviders` (+ tests).
3. `fetchFunActivities` (+ test) and `useFunActivities` hook.
4. Seed `generateDemoFunActivities()` + `run-seed-fun.mjs`; build functions; run the seed against vfit-funlife.
5. `FunRouteScreen` data-driven sections + routed `/book?providerId=` CTAs.
6. Verify: unit tests, build, manual e2e (book an activity end-to-end; confirm trainer search excludes activities).

## Risks

| Risk | Mitigation |
|---|---|
| Activities pollute trainer search / coach list | Explicit `activityKind` exclusion in both read paths; covered by unit tests. |
| `/book` screen is trainer-shaped (date picker, "Chi sono", reviews) for a fixed-date event/party | Accepted per the "reuse `/book` as-is" decision; documented as a follow-up UX refinement. |
| Activity names/locations no longer translated | Intentional — dynamic Firestore content isn't i18n'd (same as provider/service names). Card chrome stays translated. |
| Seed not run ⇒ empty VFun sections | Plan includes building functions + running the seed against vfit-funlife as an explicit step. |
| `searchProviders` `array-contains` category query could still match an activity if it shared a trainer specialty | Activities are seeded WITHOUT trainer specialties; plus the post-fetch `activityKind` exclusion catches any overlap. |

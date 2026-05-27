# Bookable VFun Activities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make VFun events, VR experiences, and party packages real bookable entities in `/instructors`, so the existing `/book?providerId=` + `createBooking` flow books them — and the VFun screen loads them from Firestore instead of static arrays.

**Architecture:** Activities are `/instructors` docs marked with an `activityKind` discriminator + one `services` subdoc each. The existing booking flow is reused unchanged. Trainer search/coach lists exclude `activityKind` docs. The VFun screen fetches activities via a new hook and routes each "book" CTA to `/book?providerId=<id>`.

**Tech Stack:** Next.js/React, TypeScript, Firebase Firestore, firebase-admin (seed), TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-27-fun-bookable-activities-design.md`

---

## File Structure

- `src/types/instructor.ts` — **modify.** `ActivityKind` type + activity fields on `Provider`.
- `src/lib/firebase/providers.ts` — **modify.** `flattenProvider` activity mapping; `fetchProviders` exclusion; new `fetchFunActivities`.
- `src/lib/firebookings.ts` — **modify.** `searchProviders` activity exclusion.
- `src/hooks/useFunActivities.ts` — **new.** `useFunActivities(kind)` query hook.
- `src/components/screens/FunRouteScreen.tsx` — **modify.** Data-driven event/VR/party sections + routed CTAs.
- `functions/src/seed/seedData.ts` — **modify.** `generateDemoFunActivities()`.
- `functions/scripts/run-seed-fun.mjs` — **new.** Seed runner.
- Tests: `src/lib/firebase/providers.test.ts` (cases), `src/lib/firebookings.test.ts` (new file).

---

### Task 1: Types + flattenProvider mapping

**Files:**
- Modify: `src/types/instructor.ts`
- Modify: `src/lib/firebase/providers.ts` (`flattenProvider`, ~lines 26-46)

- [ ] **Step 1: Add the ActivityKind type + Provider fields**

In `src/types/instructor.ts`, add the type and extend `Provider` (after `isVerified: boolean;`):

```ts
export type ActivityKind = 'event' | 'vr' | 'party';
```
Inside `interface Provider`:
```ts
  // VFun bookable-activity fields (absent ⇒ a real trainer)
  activityKind?: ActivityKind;
  eventDate?: string;      // events, e.g. "16 Feb"
  eventTime?: string;      // events, e.g. "18:30"
  location?: string;       // events, display location
  attendees?: number;      // events
  tag?: 'hot' | 'vip' | 'new'; // events
  durationMinutes?: number; // vr session length
  partyType?: string;      // party packages, e.g. "private"
```

- [ ] **Step 2: Map the fields in `flattenProvider`**

In `src/lib/firebase/providers.ts`, inside the object returned by `flattenProvider`, add (after the `photoUrls` line):

```ts
    activityKind: (data.activityKind as import('@/types/instructor').ActivityKind) ?? undefined,
    eventDate: (data.eventDate as string) ?? undefined,
    eventTime: (data.eventTime as string) ?? undefined,
    location: (data.location as string) ?? (data.city as string) ?? undefined,
    attendees: typeof data.attendees === 'number' ? (data.attendees as number) : undefined,
    tag: (data.tag as 'hot' | 'vip' | 'new') ?? undefined,
    durationMinutes: typeof data.durationMinutes === 'number' ? (data.durationMinutes as number) : undefined,
    partyType: (data.partyType as string) ?? undefined,
```
(Prefer adding `ActivityKind` to the existing `import type { ... } from '@/types/instructor'` at the top instead of the inline `import(...)`.)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds, no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/instructor.ts src/lib/firebase/providers.ts
git commit -m "feat(fun): activity fields on Provider + flattenProvider mapping"
```

---

### Task 2: Exclude activities from trainer search + lists

**Files:**
- Modify: `src/lib/firebase/providers.ts` (`fetchProviders`, ~lines 59-78)
- Test: `src/lib/firebase/providers.test.ts`
- Modify: `src/lib/firebookings.ts` (`searchProviders`, ~lines 35-50)
- Test: `src/lib/firebookings.test.ts` (new)

- [ ] **Step 1: Write the failing test for `fetchProviders` exclusion**

Add to `src/lib/firebase/providers.test.ts` (the `firebase/firestore` mock there already exposes `getDocs`/`mockGetDocs`):

```ts
describe('fetchProviders activity exclusion', () => {
  it('excludes docs with an activityKind (they are VFun activities, not trainers)', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        { id: 'trainer-1', data: () => ({ fullName: 'Real Trainer', isActive: true, providerProfile: { isVerified: true, rating: 5 } }) },
        { id: 'event-1', data: () => ({ fullName: 'Sunset Party', isActive: true, activityKind: 'event', providerProfile: { isVerified: true } }) },
      ],
    } as never);
    const all = await fetchProviders();
    expect(all.map((p) => p.id)).toEqual(['trainer-1']);
  });
});
```

- [ ] **Step 2: Run it, confirm FAIL**

Run: `npx vitest run src/lib/firebase/providers.test.ts`
Expected: FAIL — `event-1` is returned (no exclusion yet).

- [ ] **Step 3: Add the exclusion in `fetchProviders`**

In `src/lib/firebase/providers.ts`, in the `.filter(...)` chain of `fetchProviders`, add an `activityKind` guard. Change:
```ts
      .filter((p) => p.isActive && (!opts.onlyVerified || p.isVerified))
```
to:
```ts
      .filter((p) => !p.activityKind && p.isActive && (!opts.onlyVerified || p.isVerified))
```

- [ ] **Step 4: Run it, confirm PASS**

Run: `npx vitest run src/lib/firebase/providers.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for `searchProviders` exclusion**

Create `src/lib/firebookings.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(() => ({ __q: true })),
  where: vi.fn(),
  limit: vi.fn(),
  Timestamp: { fromDate: vi.fn((d) => d) },
}));

import { getDocs } from 'firebase/firestore';
import { searchProviders } from './firebookings';

const mockGetDocs = vi.mocked(getDocs);
beforeEach(() => vi.clearAllMocks());

describe('searchProviders activity exclusion', () => {
  it('omits verified docs that are VFun activities', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        { id: 'trainer-1', data: () => ({ fullName: 'Real Trainer', providerProfile: { isVerified: true } }) },
        { id: 'event-1', data: () => ({ fullName: 'Sunset Party', activityKind: 'event', providerProfile: { isVerified: true } }) },
      ],
    } as never);
    const results = await searchProviders({});
    expect(results.map((p) => p.id)).toEqual(['trainer-1']);
  });
});
```

(If the relative mock path `./firebase/config` does not match how `firebookings.ts` imports `db`, adjust the `vi.mock` path to the exact specifier used in `firebookings.ts`.)

- [ ] **Step 6: Run it, confirm FAIL**

Run: `npx vitest run src/lib/firebookings.test.ts`
Expected: FAIL — `event-1` returned.

- [ ] **Step 7: Add the exclusion in `searchProviders`**

In `src/lib/firebookings.ts`, right after `const snapshot = await getDocs(providersQuery);`, filter the raw docs before mapping. Change:
```ts
  let providers = snapshot.docs.map((doc) => {
```
to:
```ts
  let providers = snapshot.docs
    .filter((doc) => !doc.data().activityKind)
    .map((doc) => {
```

- [ ] **Step 8: Run it, confirm PASS + full file**

Run: `npx vitest run src/lib/firebookings.test.ts src/lib/firebase/providers.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/firebase/providers.ts src/lib/firebase/providers.test.ts src/lib/firebookings.ts src/lib/firebookings.test.ts
git commit -m "feat(fun): exclude activities from trainer search + provider lists"
```

---

### Task 3: fetchFunActivities + useFunActivities hook

**Files:**
- Modify: `src/lib/firebase/providers.ts` (add `fetchFunActivities`)
- Test: `src/lib/firebase/providers.test.ts`
- Create: `src/hooks/useFunActivities.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/firebase/providers.test.ts`:

```ts
import { fetchFunActivities } from './providers';

describe('fetchFunActivities', () => {
  it('returns only active activities of the requested kind, mapping activity fields', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        { id: 'event-1', data: () => ({ fullName: 'Sunset Sessions', isActive: true, activityKind: 'event', eventDate: '16 Feb', tag: 'hot', providerProfile: { isVerified: true } }) },
      ],
    } as never);
    const events = await fetchFunActivities('event');
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({ id: 'event-1', activityKind: 'event', eventDate: '16 Feb', tag: 'hot' }));
  });
});
```

- [ ] **Step 2: Run it, confirm FAIL**

Run: `npx vitest run src/lib/firebase/providers.test.ts`
Expected: FAIL — `fetchFunActivities` not exported.

- [ ] **Step 3: Implement `fetchFunActivities`**

In `src/lib/firebase/providers.ts` (uses the already-imported `collection`, `query`, `where`, `getDocs`, `flattenProvider`, `db`), add:

```ts
import type { ActivityKind } from '@/types/instructor';

export async function fetchFunActivities(kind: ActivityKind): Promise<Provider[]> {
  try {
    const q = query(collection(db, 'instructors'), where('activityKind', '==', kind));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => flattenProvider(d.id, d.data() as Record<string, unknown>))
      .filter((p) => p.isActive);
  } catch (error) {
    console.error('[fetchFunActivities]', kind, error);
    return [];
  }
}
```
(Add `ActivityKind` to the existing `@/types/instructor` import rather than a second import line.)

- [ ] **Step 4: Run it, confirm PASS**

Run: `npx vitest run src/lib/firebase/providers.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Implement the hook**

Create `src/hooks/useFunActivities.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { fetchFunActivities } from '@/lib/firebase/providers';
import type { ActivityKind } from '@/types/instructor';

export function useFunActivities(kind: ActivityKind) {
  return useQuery({
    queryKey: ['fun-activities', kind],
    queryFn: () => fetchFunActivities(kind),
    staleTime: 5 * 60_000,
  });
}
```

- [ ] **Step 6: Build + commit**

Run: `npm run build` (succeeds).
```bash
git add src/lib/firebase/providers.ts src/lib/firebase/providers.test.ts src/hooks/useFunActivities.ts
git commit -m "feat(fun): fetchFunActivities + useFunActivities hook"
```

---

### Task 4: Seed fun activities + runner

**Files:**
- Modify: `functions/src/seed/seedData.ts` (add `generateDemoFunActivities`)
- Create: `functions/scripts/run-seed-fun.mjs`

- [ ] **Step 1: Add the seed function**

In `functions/src/seed/seedData.ts`, follow the file's existing pattern for writing an `/instructors/{id}` doc + a `/instructors/{id}/services/{serviceId}` subdoc (reuse the same `db`/admin handle, `FieldValue.serverTimestamp()`, and merge-set conventions already used by `generateDemoData`/`seedSampleInstructors` in this file). Add an exported async function `generateDemoFunActivities()` that writes these 11 activities (deterministic ids; idempotent `set(..., { merge: true })`), each with `providerProfile.isVerified: true`, `isActive: true`, `lowestPrice` = the price, and ONE service subdoc:

```ts
// activity defs (id, kind, name, price, + metadata, + service)
const FUN_ACTIVITIES = [
  // EVENTS — service = ticket; durationMinutes default 120
  { id: 'fun-event-sunset', kind: 'event', name: 'Sunset Sessions', price: 39, eventDate: '16 Feb', eventTime: '18:30', location: 'Rooftop Milano', attendees: 420, tag: 'hot', serviceName: 'Biglietto evento', durationMinutes: 120 },
  { id: 'fun-event-fitparty', kind: 'event', name: 'Fit Party Night', price: 28, eventDate: '20 Feb', eventTime: '21:00', location: 'Arena Roma', attendees: 680, tag: 'new', serviceName: 'Biglietto evento', durationMinutes: 120 },
  { id: 'fun-event-vipgala', kind: 'event', name: 'VIP Gala Night', price: 90, eventDate: '27 Feb', eventTime: '20:30', location: 'Grand Hotel Firenze', attendees: 180, tag: 'vip', serviceName: 'Biglietto VIP', durationMinutes: 180 },
  { id: 'fun-event-neonrun', kind: 'event', name: 'Neon Run', price: 32, eventDate: '3 Mar', eventTime: '22:00', location: 'Parco Torino', attendees: 510, tag: 'hot', serviceName: 'Pettorale + kit', durationMinutes: 120 },
  // VR — service = session
  { id: 'fun-vr-boxing', kind: 'vr', name: 'VR Boxing Pro', price: 22, durationMinutes: 45, serviceName: 'Sessione VR', },
  { id: 'fun-vr-dance', kind: 'vr', name: 'VR Dance Battle', price: 16, durationMinutes: 30, serviceName: 'Sessione VR', },
  { id: 'fun-vr-racing', kind: 'vr', name: 'VR Racing League', price: 20, durationMinutes: 35, serviceName: 'Sessione VR', },
  { id: 'fun-vr-escape', kind: 'vr', name: 'VR Escape Room', price: 26, durationMinutes: 60, serviceName: 'Sessione VR', },
  // PARTIES — service = package; durationMinutes default 240
  { id: 'fun-party-private', kind: 'party', name: 'Private Party', price: 790, partyType: 'private', serviceName: 'Pacchetto Private', durationMinutes: 240 },
  { id: 'fun-party-corporate', kind: 'party', name: 'Corporate Event', price: 1490, partyType: 'corporate', serviceName: 'Pacchetto Corporate', durationMinutes: 240 },
  { id: 'fun-party-vip', kind: 'party', name: 'VIP Party', price: 2600, partyType: 'vip', serviceName: 'Pacchetto VIP', durationMinutes: 240 },
] as const;
```
For each activity, write the instructor doc with fields: `uid: id`, `name`, `fullName: name`, `avatarUrl: null`, `isActive: true`, `activityKind: kind`, the kind-specific metadata present on the def (`eventDate`/`eventTime`/`location`/`attendees`/`tag` for events, `durationMinutes` for vr, `partyType` for parties), `lowestPrice: price`, `providerProfile: { isVerified: true, isActive: true, specialties: [], rating: 0, reviewCount: 0, bio: '' }`, `createdAt`/`updatedAt` server timestamps. Then write the service subdoc at `instructors/{id}/services/svc-1` with `{ name: serviceName, price, durationMinutes: <def.durationMinutes ?? 120>, isActive: true }`. Return `{ activities: FUN_ACTIVITIES.length }`.

(Match the exact admin-SDK write style already used in this file — do not introduce a new Firestore client style.)

- [ ] **Step 2: Create the runner**

Create `functions/scripts/run-seed-fun.mjs` (mirror `functions/scripts/run-seed-demo.mjs`):

```js
import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'vfit-funlife' });

const mod = await import('../lib/seed/seedData.js');

console.log('[seed] Starting generateDemoFunActivities...');
const start = Date.now();
const results = await mod.generateDemoFunActivities();
const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`[seed] Done in ${elapsed}s`);
console.log(JSON.stringify(results, null, 2));
process.exit(0);
```

- [ ] **Step 3: Build functions + run the seed**

Run:
```bash
cd functions && npm run build && cd ..
GOOGLE_APPLICATION_CREDENTIALS=~/.config/firebase-cli-adc.json GOOGLE_CLOUD_PROJECT=vfit-funlife node functions/scripts/run-seed-fun.mjs
```
Expected: prints `{ "activities": 11 }`, exit 0. (This writes to the live `vfit-funlife` Firestore — the controller will run this step.)

- [ ] **Step 4: Commit**

```bash
git add functions/src/seed/seedData.ts functions/scripts/run-seed-fun.mjs
git commit -m "feat(fun): seed events/VR/parties as bookable instructor docs"
```

---

### Task 5: VFun screen — data-driven + routed CTAs

**Files:**
- Modify: `src/components/screens/FunRouteScreen.tsx`

- [ ] **Step 1: Fetch activities from Firestore**

In `FunRouteScreen.tsx`, import the hook: `import { useFunActivities } from '@/hooks/useFunActivities';`. Inside the component, add:
```ts
  const eventsQuery = useFunActivities('event');
  const vrQuery = useFunActivities('vr');
  const partyQuery = useFunActivities('party');
```
Replace usages of the static `upcomingEvents` / `vrExperiences` / `partyPackages` arrays with `eventsQuery.data ?? []`, `vrQuery.data ?? []`, `partyQuery.data ?? []` respectively. (The event search/filter (`filteredEvents`) should now operate on `eventsQuery.data ?? []`; titles/locations come from `event.fullName` / `event.location` instead of `t(event.titleKey)` / `t(event.locationKey)`.)

- [ ] **Step 2: Render cards from the fetched `Provider` shape**

Update the three card blocks to read the dynamic fields:
- Events: title `event.fullName`; date `event.eventDate`; time `event.eventTime`; location `event.location`; attendees `event.attendees`; tag `event.tag`; price `event.lowestPrice`.
- VR: title `experience.fullName`; duration `experience.durationMinutes`; price `experience.lowestPrice`.
- Parties: name `partyPackage.fullName`; price `partyPackage.lowestPrice`. (Party feature bullets were `featureKeys`; since data is now dynamic, drop the per-package feature list or show the package name + price + a generic line — keep it simple: name + capacity-from-price; do NOT invent translated features.)
Keep all surrounding chrome (`t('funRoute.*')` stats, filters, button labels, headings) as-is. Guard against `undefined` fields.

- [ ] **Step 3: Route the book CTAs by activity id**

- Events book button (~line 402): change `href="/booking"` → `href={`/book?providerId=${event.id}`}`.
- VR book button (~line 444): change `href="/booking"` → `href={`/book?providerId=${experience.id}`}`.
- Party packages: add a book CTA to each package card (matching the events/VR button style) → `href={`/book?providerId=${partyPackage.id}`}` with label `t('funRoute.party.package.book')` (add this key — see Step 4). Leave the separate quote form unchanged.
- The events-section footer CTA (~line 627, a generic "tickets" link): leave pointing at the events route or `/fun/events` — it is not per-activity. Do NOT leave it as `/booking` (the search page); change it to `href="/fun/events"`.

- [ ] **Step 4: Add loading/empty states + the one new key**

For each section, when `query.isLoading` show a loading line (`t('common.loading')`), and when `(query.data ?? []).length === 0` show the section's existing empty key (`funRoute.events.empty`, etc.; add `funRoute.vr.empty` / `funRoute.party.empty` if missing). Add `funRoute.party.package.book` to ALL 5 locale files (`it/en/es/fr/de`) — e.g. it: `'Prenota pacchetto'`, en: `'Book package'`, es: `'Reservar paquete'`, fr: `'Réserver le forfait'`, de: `'Paket buchen'`. Any other new key must also be added to all 5 (compile-time completeness gate from the i18n work will fail the build otherwise).

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: succeeds; completeness test still green (`npx vitest run src/i18n/messages/completeness.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/components/screens/FunRouteScreen.tsx src/i18n/messages/it.ts src/i18n/messages/en.ts src/i18n/messages/es.ts src/i18n/messages/fr.ts src/i18n/messages/de.ts
git commit -m "feat(fun): VFun activities load from Firestore + book CTAs route by id"
```

---

### Task 6: Verification

**Files:** none.

- [ ] **Step 1: Unit suite**

Run: `npx vitest run src/lib/firebase/providers.test.ts src/lib/firebookings.test.ts src/i18n/messages/completeness.test.ts`
Expected: all pass.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Manual e2e (dev server + vfit-funlife, after the seed ran)**

`npm run dev`, then:
1. Open `/fun/events` → events render from Firestore (real names/dates/prices).
2. Click a book button → lands on `/book?providerId=fun-event-...` showing that activity + its service (not the search page).
3. Pick the service + a slot → confirm a booking is created (persists).
4. Open `/booking` (trainer search) and the home "find a coach" list → confirm NO fun activities appear among trainers.
5. Repeat the book flow for a VR experience and a party package.

- [ ] **Step 4: Final commit (if fixes needed)**

```bash
git add -A
git commit -m "test(fun): verification fixes for bookable activities"
```

---

## Notes for the implementer

- Don't change `BookingClient` or `createBooking` — activities reuse them as-is.
- The `activityKind` exclusion must be in BOTH `searchProviders` and `fetchProviders`; missing `activityKind` = trainer.
- Activity names/locations are dynamic Firestore content — do NOT route them through `t()`. Only NEW UI-chrome strings (like the party book label) go in the catalog, in all 5 locales.
- Seed writes to the live `vfit-funlife` Firestore; the controller runs the seed step.

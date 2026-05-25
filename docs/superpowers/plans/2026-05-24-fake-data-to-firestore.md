# Fake Data → Firestore Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every hardcoded "fake data" surface in the app with Firestore reads, eliminating the `venue/[id]` runtime error and making content editable without redeploys.

**Architecture:** Per-route dynamic pages use the `[{id:'placeholder'}]` static-export pattern. The catch-all hosting rewrite (`**` → `/index.html`) serves the shell HTML for any URL; the client reads the real ID via `useParams()` and fetches from Firestore through typed accessors wrapped in TanStack Query hooks. Build never touches Firestore.

**Tech Stack:** Next.js 16 (static export) · React 19 · TanStack Query v5 · Firebase JS SDK v12 · Vitest · firebase-admin (server-side seed only)

**Spec:** `docs/superpowers/specs/2026-05-24-fake-data-to-firestore-design.md`

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `src/types/venue.ts` | `Venue`, `VenueService`, `VenueCourse`, `AmenityKind`, related types |
| `src/types/instructor.ts` | `Provider`, `ProviderService` types (customer-facing instructor profile) |
| `src/lib/icons/amenityIcons.ts` | `AmenityKind` → Lucide component registry |
| `src/lib/firebase/venues.ts` | `fetchVenue`, `fetchVenues`, `fetchVenueServices`, `fetchVenueCourses` |
| `src/lib/firebase/venues.test.ts` | Vitest tests for venue accessors |
| `src/lib/firebase/providers.ts` | `fetchProvider`, `fetchProviders`, `fetchProviderServices` |
| `src/lib/firebase/providers.test.ts` | Vitest tests for provider accessors |
| `src/hooks/useVenues.ts` | `useVenue`, `useVenues`, `useVenueServices`, `useVenueCourses` hooks |
| `src/hooks/useProviders.ts` | `useProvider`, `useProviders`, `useProviderServices` hooks |
| `src/components/venue/VenueNotFound.tsx` | Inline 404 panel for missing venues |

### Modified

| Path | Change |
|---|---|
| `firestore.rules` | Add `/venues/{id}/courses` + `/instructors/{id}/services` rules |
| `functions/src/seed/seedData.ts` | Add `seedSampleVenues()` + `seedSampleInstructors()` + wire into `seedQuickData` |
| `src/app/(main)/venue/[id]/page.tsx` | Use placeholder `generateStaticParams` |
| `src/app/(main)/venue/[id]/VenueDetailClient.tsx` | `useParams()` + hooks; no more `data.ts` import |
| `src/app/(main)/fit/gyms/page.tsx` | Use `useVenues({ type: 'gym' })` instead of inline array |
| `src/app/booking/[providerId]/BookingClient.tsx` | Use `useProvider` + `useProviderServices` instead of `MOCK_PROVIDER` |
| `src/app/admin/venues/page.tsx` | Use `useVenues({})` instead of inline array |
| `src/app/(main)/home/page.tsx` | Replace inline `useVenuesByType`/`useTopProviders`/`useTodayClasses`/`useTestimonials` with shared hooks |
| `src/hooks/index.ts` | Re-export new hooks |
| `e2e/venue.spec.ts` | Assert venue rendered from seeded Firestore data; add unknown-id case |

### Deleted

| Path | Reason |
|---|---|
| `src/app/(main)/venue/[id]/data.ts` | Replaced by Firestore + hooks |
| `src/lib/mockData.ts` | Already had no consumers; remove dead code |

---

## Task 1: Firestore rules — courses + instructor services

**Files:**
- Modify: `firestore.rules:244-265` (venues subcollections), `firestore.rules:267-296` (instructors subcollections)

- [ ] **Step 1: Read the current rules block to find exact insertion points**

Run: `grep -n "match /services\|match /reviews\|match /courses\|match /availability" firestore.rules`
Expected: lines for existing subcollection rules under `/venues` and `/instructors`.

- [ ] **Step 2: Add `/venues/{id}/courses/{courseId}` rule under `/venues/{venueId}`**

Insert immediately after the existing `match /services/{serviceId}` block (around line 248):

```
      match /courses/{courseId} {
        allow read: if true;
        allow write: if isAdmin() || isVenueStaff(venueId);
      }
```

- [ ] **Step 3: Add `/instructors/{id}/services/{serviceId}` rule under `/instructors/{instructorId}`**

Insert immediately after the closing brace of `match /reviews/{reviewId}` (around line 282), before `match /availability`:

```
      match /services/{serviceId} {
        allow read: if true;
        allow write: if isAdmin() ||
          (isAuthenticated() && get(/databases/$(database)/documents/instructors/$(instructorId)).data.uid == request.auth.uid);
      }
```

- [ ] **Step 4: Lint the rules locally**

Run: `npx firebase emulators:exec --only firestore "echo rules-ok"`
Expected: Emulator starts, prints rules compiled successfully, exits 0. (If `firebase-tools` isn't installed locally, use `npx -p firebase-tools firebase emulators:exec ...`.)

- [ ] **Step 5: Deploy rules to dev project**

Run: `npm run deploy:rules`
Expected: `firebase deploy --only firestore:rules` succeeds. Confirm in Firebase Console > Firestore > Rules tab that the new `courses` and instructor `services` rules appear.

- [ ] **Step 6: Commit**

```bash
git add firestore.rules
git commit -m "$(cat <<'EOF'
feat(rules): allow public read on venue courses and instructor services

Unblocks Firestore reads for the venue detail courses subcollection
and the instructor services subcollection, both of which had no rule
defined and would otherwise return empty results.
EOF
)"
```

---

## Task 2: Venue types

**Files:**
- Create: `src/types/venue.ts`

- [ ] **Step 1: Create the venue type module**

```ts
// src/types/venue.ts
import type { Timestamp } from 'firebase/firestore';

export type VenueType = 'gym' | 'wellness_center' | 'spa' | 'beauty_salon';

export type AmenityKind =
  | 'sala_pesi'
  | 'wifi'
  | 'parcheggio'
  | 'docce'
  | 'sauna'
  | 'pool'
  | 'crossfit'
  | 'boxing'
  | 'yoga'
  | 'pilates'
  | 'spa'
  | 'tennis'
  | 'weights'
  | 'cardio';

export interface AmenityRef {
  kind: AmenityKind;
  labelKey?: string;
}

export interface VenueHours {
  day: string;
  time: string;
}

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

export interface VenueService {
  id: string;
  name: string;
  price: number;
  durationMinutes?: number;
  description?: string;
  isActive: boolean;
}

export interface VenueCourse {
  id: string;
  name: string;
  time: string;
  coach: string;
  spots: number;
  dayOfWeek?: number;
}

export interface VenueListOptions {
  type?: VenueType;
  city?: string;
  limit?: number;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/venue.ts
git commit -m "feat(types): add Venue, VenueService, VenueCourse, AmenityKind"
```

---

## Task 3: Instructor (customer-facing provider) types

**Files:**
- Create: `src/types/instructor.ts`

- [ ] **Step 1: Create the instructor type module**

```ts
// src/types/instructor.ts
import type { Timestamp } from 'firebase/firestore';

export interface Provider {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  rating: number;
  reviewCount: number;
  isVerified: boolean;
  isActive: boolean;
  specialties: string[];
  yearsOfExperience: number;
  languages: string[];
  bioKey?: string;
  city?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ProviderService {
  id: string;
  name: string;
  description?: string;
  durationMinutes: number;
  price: number;
  isActive: boolean;
}

export interface ProviderListOptions {
  limit?: number;
  specialty?: string;
  onlyVerified?: boolean;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/instructor.ts
git commit -m "feat(types): add customer-facing Provider and ProviderService"
```

---

## Task 4: Amenity icon registry

**Files:**
- Create: `src/lib/icons/amenityIcons.ts`

- [ ] **Step 1: Create the icon registry**

```ts
// src/lib/icons/amenityIcons.ts
import {
  Dumbbell,
  Wifi,
  Car,
  Droplet,
  Bath,
  Waves,
  Flame,
  Square,
  Sparkles,
  Activity,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';
import type { AmenityKind } from '@/types/venue';

export const AMENITY_ICONS: Record<AmenityKind, LucideIcon> = {
  sala_pesi: Dumbbell,
  wifi: Wifi,
  parcheggio: Car,
  docce: Droplet,
  sauna: Bath,
  pool: Waves,
  crossfit: Flame,
  boxing: Activity,
  yoga: Sparkles,
  pilates: Sparkles,
  spa: Sparkles,
  tennis: Square,
  weights: Dumbbell,
  cardio: Activity,
};

export function amenityIcon(kind: AmenityKind): LucideIcon {
  const icon = AMENITY_ICONS[kind];
  if (!icon) {
    console.warn(`[amenityIcon] No icon registered for kind "${kind}"`);
    return HelpCircle;
  }
  return icon;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/icons/amenityIcons.ts
git commit -m "feat(icons): map AmenityKind to Lucide components"
```

---

## Task 5: Venue Firestore accessors (TDD)

**Files:**
- Create: `src/lib/firebase/venues.ts`
- Create: `src/lib/firebase/venues.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/firebase/venues.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchVenue,
  fetchVenues,
  fetchVenueServices,
  fetchVenueCourses,
} from './venues';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn((..._args) => ({ __query: true })),
  where: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  Timestamp: { now: () => ({ seconds: 0, nanoseconds: 0 }) },
}));

import { getDoc, getDocs } from 'firebase/firestore';

const mockGetDoc = vi.mocked(getDoc);
const mockGetDocs = vi.mocked(getDocs);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchVenue', () => {
  it('returns null when document does not exist', async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => false } as never);
    const result = await fetchVenue('missing');
    expect(result).toBeNull();
  });

  it('returns venue with id injected when document exists', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      id: 'carosello',
      data: () => ({ name: 'Carosello Fitness', type: 'gym' }),
    } as never);
    const result = await fetchVenue('carosello');
    expect(result).toEqual({ id: 'carosello', name: 'Carosello Fitness', type: 'gym' });
  });
});

describe('fetchVenues', () => {
  it('returns array of venues from snapshot', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        { id: 'a', data: () => ({ name: 'A', type: 'gym' }) },
        { id: 'b', data: () => ({ name: 'B', type: 'gym' }) },
      ],
    } as never);
    const result = await fetchVenues({ type: 'gym' });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 'a', name: 'A', type: 'gym' });
  });

  it('returns empty array on error', async () => {
    mockGetDocs.mockRejectedValueOnce(new Error('network'));
    const result = await fetchVenues();
    expect(result).toEqual([]);
  });
});

describe('fetchVenueServices', () => {
  it('returns services from subcollection', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [{ id: 'svc-1', data: () => ({ name: 'Daily pass', price: 18, isActive: true }) }],
    } as never);
    const result = await fetchVenueServices('carosello');
    expect(result).toEqual([{ id: 'svc-1', name: 'Daily pass', price: 18, isActive: true }]);
  });
});

describe('fetchVenueCourses', () => {
  it('returns courses from subcollection', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [{ id: 'c-1', data: () => ({ name: 'HIIT', time: '07:30', coach: 'Marco', spots: 3 }) }],
    } as never);
    const result = await fetchVenueCourses('carosello');
    expect(result).toEqual([{ id: 'c-1', name: 'HIIT', time: '07:30', coach: 'Marco', spots: 3 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/firebase/venues.test.ts`
Expected: FAIL — "Cannot find module './venues'"

- [ ] **Step 3: Implement the accessors**

```ts
// src/lib/firebase/venues.ts
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit as limitQuery,
} from 'firebase/firestore';
import { db } from './config';
import type {
  Venue,
  VenueListOptions,
  VenueService,
  VenueCourse,
} from '@/types/venue';

export async function fetchVenue(id: string): Promise<Venue | null> {
  try {
    const snap = await getDoc(doc(db, 'venues', id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<Venue, 'id'>) };
  } catch (error) {
    console.error('[fetchVenue]', id, error);
    return null;
  }
}

export async function fetchVenues(opts: VenueListOptions = {}): Promise<Venue[]> {
  try {
    const constraints = [];
    if (opts.type) constraints.push(where('type', '==', opts.type));
    if (opts.city) constraints.push(where('city', '==', opts.city));
    if (opts.limit) constraints.push(limitQuery(opts.limit));
    const q = constraints.length
      ? query(collection(db, 'venues'), ...constraints)
      : collection(db, 'venues');
    const snap = await getDocs(q as never);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Venue, 'id'>) }));
  } catch (error) {
    console.error('[fetchVenues]', opts, error);
    return [];
  }
}

export async function fetchVenueServices(venueId: string): Promise<VenueService[]> {
  try {
    const snap = await getDocs(collection(db, 'venues', venueId, 'services'));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<VenueService, 'id'>) }));
  } catch (error) {
    console.error('[fetchVenueServices]', venueId, error);
    return [];
  }
}

export async function fetchVenueCourses(venueId: string): Promise<VenueCourse[]> {
  try {
    const snap = await getDocs(collection(db, 'venues', venueId, 'courses'));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<VenueCourse, 'id'>) }));
  } catch (error) {
    console.error('[fetchVenueCourses]', venueId, error);
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/lib/firebase/venues.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/firebase/venues.ts src/lib/firebase/venues.test.ts
git commit -m "feat(firebase): typed venue accessors with subcollection helpers"
```

---

## Task 6: Provider Firestore accessors (TDD)

**Files:**
- Create: `src/lib/firebase/providers.ts`
- Create: `src/lib/firebase/providers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/firebase/providers.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchProvider, fetchProviders, fetchProviderServices } from './providers';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(() => ({ __query: true })),
  where: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
}));

import { getDoc, getDocs } from 'firebase/firestore';

const mockGetDoc = vi.mocked(getDoc);
const mockGetDocs = vi.mocked(getDocs);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchProvider', () => {
  it('returns null when missing', async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => false } as never);
    expect(await fetchProvider('x')).toBeNull();
  });

  it('flattens providerProfile into Provider shape', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      id: 'provider-1',
      data: () => ({
        fullName: 'Marco Rossi',
        avatarUrl: null,
        providerProfile: {
          isVerified: true,
          rating: 4.8,
          reviewCount: 127,
          specialties: ['Personal Training'],
          yearsOfExperience: 8,
        },
      }),
    } as never);
    const p = await fetchProvider('provider-1');
    expect(p).toEqual(expect.objectContaining({
      id: 'provider-1',
      fullName: 'Marco Rossi',
      isVerified: true,
      rating: 4.8,
      specialties: ['Personal Training'],
      yearsOfExperience: 8,
    }));
  });
});

describe('fetchProviders', () => {
  it('returns active verified providers only', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        { id: 'a', data: () => ({ fullName: 'A', providerProfile: { isVerified: true, isActive: true, rating: 5 } }) },
        { id: 'b', data: () => ({ fullName: 'B', providerProfile: { isVerified: false } }) },
      ],
    } as never);
    const all = await fetchProviders({ onlyVerified: true });
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('a');
  });
});

describe('fetchProviderServices', () => {
  it('returns services from instructors/{id}/services', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [{ id: 'svc-1', data: () => ({ name: 'PT 1-to-1', price: 60, durationMinutes: 60, isActive: true }) }],
    } as never);
    const result = await fetchProviderServices('provider-1');
    expect(result[0].name).toBe('PT 1-to-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/firebase/providers.test.ts`
Expected: FAIL — "Cannot find module './providers'"

- [ ] **Step 3: Implement the accessors**

```ts
// src/lib/firebase/providers.ts
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit as limitQuery,
} from 'firebase/firestore';
import { db } from './config';
import type {
  Provider,
  ProviderService,
  ProviderListOptions,
} from '@/types/instructor';

function flattenProvider(id: string, data: Record<string, unknown>): Provider {
  const profile = (data.providerProfile ?? {}) as Record<string, unknown>;
  return {
    id,
    fullName: (data.fullName as string) ?? (data.name as string) ?? 'Provider',
    avatarUrl: (data.avatarUrl as string | null) ?? null,
    rating: (data.ratingAvg as number) ?? (profile.rating as number) ?? 0,
    reviewCount: (data.reviewCount as number) ?? (profile.reviewCount as number) ?? 0,
    isVerified: (profile.isVerified as boolean) ?? false,
    isActive: (data.isActive as boolean) ?? (profile.isActive as boolean) ?? true,
    specialties: (data.specialties as string[]) ?? (profile.specialties as string[]) ?? [],
    yearsOfExperience:
      (data.experienceYears as number) ?? (profile.yearsOfExperience as number) ?? 0,
    languages: (data.languages as string[]) ?? (profile.languages as string[]) ?? [],
    bioKey: (data.bioKey as string) ?? undefined,
    city: (data.city as string) ?? undefined,
  };
}

export async function fetchProvider(id: string): Promise<Provider | null> {
  try {
    const snap = await getDoc(doc(db, 'instructors', id));
    if (!snap.exists()) return null;
    return flattenProvider(snap.id, snap.data() as Record<string, unknown>);
  } catch (error) {
    console.error('[fetchProvider]', id, error);
    return null;
  }
}

export async function fetchProviders(opts: ProviderListOptions = {}): Promise<Provider[]> {
  try {
    const constraints = [];
    if (opts.onlyVerified) {
      constraints.push(where('providerProfile.isVerified', '==', true));
    }
    if (opts.limit) constraints.push(limitQuery(opts.limit));
    const q = constraints.length
      ? query(collection(db, 'instructors'), ...constraints)
      : collection(db, 'instructors');
    const snap = await getDocs(q as never);
    return snap.docs
      .map((d) => flattenProvider(d.id, d.data() as Record<string, unknown>))
      .filter((p) => p.isActive && (!opts.onlyVerified || p.isVerified))
      .filter((p) => !opts.specialty || p.specialties.includes(opts.specialty));
  } catch (error) {
    console.error('[fetchProviders]', opts, error);
    return [];
  }
}

export async function fetchProviderServices(providerId: string): Promise<ProviderService[]> {
  try {
    const snap = await getDocs(collection(db, 'instructors', providerId, 'services'));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ProviderService, 'id'>) }));
  } catch (error) {
    console.error('[fetchProviderServices]', providerId, error);
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/lib/firebase/providers.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/firebase/providers.ts src/lib/firebase/providers.test.ts
git commit -m "feat(firebase): typed instructor/provider accessors"
```

---

## Task 7: Venue hooks

**Files:**
- Create: `src/hooks/useVenues.ts`
- Modify: `src/hooks/index.ts`

- [ ] **Step 1: Create the hooks file**

```ts
// src/hooks/useVenues.ts
import { useQuery } from '@tanstack/react-query';
import {
  fetchVenue,
  fetchVenues,
  fetchVenueServices,
  fetchVenueCourses,
} from '@/lib/firebase/venues';
import type { VenueListOptions } from '@/types/venue';

const STALE_5_MIN = 5 * 60 * 1000;

export function useVenue(id: string | undefined) {
  return useQuery({
    queryKey: ['venue', id],
    queryFn: () => fetchVenue(id as string),
    enabled: !!id && id !== 'placeholder',
    staleTime: STALE_5_MIN,
  });
}

export function useVenues(opts: VenueListOptions = {}) {
  return useQuery({
    queryKey: ['venues', opts],
    queryFn: () => fetchVenues(opts),
    staleTime: STALE_5_MIN,
  });
}

export function useVenueServices(venueId: string | undefined) {
  return useQuery({
    queryKey: ['venue-services', venueId],
    queryFn: () => fetchVenueServices(venueId as string),
    enabled: !!venueId && venueId !== 'placeholder',
    staleTime: STALE_5_MIN,
  });
}

export function useVenueCourses(venueId: string | undefined) {
  return useQuery({
    queryKey: ['venue-courses', venueId],
    queryFn: () => fetchVenueCourses(venueId as string),
    enabled: !!venueId && venueId !== 'placeholder',
    staleTime: STALE_5_MIN,
  });
}
```

- [ ] **Step 2: Update `src/hooks/index.ts`**

Add at end of file:

```ts
export { useVenue, useVenues, useVenueServices, useVenueCourses } from './useVenues';
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useVenues.ts src/hooks/index.ts
git commit -m "feat(hooks): useVenue/useVenues/useVenueServices/useVenueCourses"
```

---

## Task 8: Provider hooks

**Files:**
- Create: `src/hooks/useProviders.ts`
- Modify: `src/hooks/index.ts`

- [ ] **Step 1: Create the hooks file**

```ts
// src/hooks/useProviders.ts
import { useQuery } from '@tanstack/react-query';
import {
  fetchProvider,
  fetchProviders,
  fetchProviderServices,
} from '@/lib/firebase/providers';
import type { ProviderListOptions } from '@/types/instructor';

const STALE_5_MIN = 5 * 60 * 1000;

export function useProvider(id: string | undefined) {
  return useQuery({
    queryKey: ['provider', id],
    queryFn: () => fetchProvider(id as string),
    enabled: !!id && id !== 'placeholder',
    staleTime: STALE_5_MIN,
  });
}

export function useProviders(opts: ProviderListOptions = {}) {
  return useQuery({
    queryKey: ['providers', opts],
    queryFn: () => fetchProviders(opts),
    staleTime: STALE_5_MIN,
  });
}

export function useProviderServices(providerId: string | undefined) {
  return useQuery({
    queryKey: ['provider-services', providerId],
    queryFn: () => fetchProviderServices(providerId as string),
    enabled: !!providerId && providerId !== 'placeholder',
    staleTime: STALE_5_MIN,
  });
}
```

- [ ] **Step 2: Update `src/hooks/index.ts`**

Append:

```ts
export { useProvider, useProviders, useProviderServices } from './useProviders';
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useProviders.ts src/hooks/index.ts
git commit -m "feat(hooks): useProvider/useProviders/useProviderServices"
```

---

## Task 9: Seeder — sample venues

**Files:**
- Modify: `functions/src/seed/seedData.ts` (append new function before the exported handlers)

- [ ] **Step 1: Add a sample venue dataset constant and seeder function**

Insert before the `export const seedAllData = ...` line:

```ts
// ===== Sample venue seed data =====

interface SampleVenueData {
  id: string;
  name: string;
  slug: string;
  type: 'gym' | 'wellness_center' | 'spa' | 'beauty_salon';
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
  amenities: { kind: string }[];
  hours: { day: string; time: string }[];
  services: { id: string; name: string; price: number; durationMinutes?: number; isActive: boolean }[];
  courses: { id: string; name: string; time: string; coach: string; spots: number }[];
}

const SAMPLE_VENUES: SampleVenueData[] = [
  {
    id: 'carosello',
    name: 'Carosello Fitness',
    slug: 'carosello-fitness',
    type: 'gym',
    city: 'Milano',
    address: 'Via Torino 21, Milano',
    lat: 45.4642,
    lng: 9.19,
    rating: 4.8,
    reviewCount: 124,
    isPartner: true,
    isActive: true,
    description:
      'Un centro fitness moderno con spazi ampi, area functional e sale corsi dedicate.',
    heroGradients: [
      'from-vfit-secondary/40 via-vfit-primary/30 to-transparent',
      'from-vfit-primary/35 via-vfit-accent/25 to-transparent',
      'from-vfit-secondary/30 via-vfit-accent/25 to-transparent',
    ],
    amenities: [
      { kind: 'sala_pesi' }, { kind: 'wifi' }, { kind: 'parcheggio' }, { kind: 'docce' },
    ],
    hours: [
      { day: 'Lun - Ven', time: '06:00 - 22:00' },
      { day: 'Sabato', time: '08:00 - 20:00' },
      { day: 'Domenica', time: '09:00 - 18:00' },
    ],
    services: [
      { id: 'svc-1', name: 'Accesso giornaliero', price: 18, isActive: true },
      { id: 'svc-2', name: 'Abbonamento mensile', price: 59, isActive: true },
      { id: 'svc-3', name: 'Personal training', price: 45, durationMinutes: 60, isActive: true },
    ],
    courses: [
      { id: 'course-1', name: 'HIIT Power', time: '07:30', coach: 'Marco R.', spots: 3 },
      { id: 'course-2', name: 'Pilates Flow', time: '12:15', coach: 'Elena B.', spots: 6 },
      { id: 'course-3', name: 'Functional 360', time: '19:00', coach: 'Luca S.', spots: 2 },
    ],
  },
  {
    id: 'urban-core',
    name: 'Urban Core Gym',
    slug: 'urban-core-gym',
    type: 'gym',
    city: 'Milano',
    address: 'Viale Liberazione 12, Milano',
    lat: 45.4789,
    lng: 9.1965,
    rating: 4.9,
    reviewCount: 98,
    isPartner: false,
    isActive: true,
    description:
      'Allenamenti ad alta intensita in un ambiente urbano con coach dedicati e attrezzatura premium.',
    heroGradients: [
      'from-vfit-primary/40 via-vfit-secondary/30 to-transparent',
      'from-vfit-accent/35 via-vfit-primary/25 to-transparent',
    ],
    amenities: [{ kind: 'sala_pesi' }, { kind: 'wifi' }, { kind: 'docce' }],
    hours: [
      { day: 'Lun - Ven', time: '06:30 - 23:00' },
      { day: 'Sabato', time: '08:00 - 21:00' },
      { day: 'Domenica', time: '09:00 - 17:00' },
    ],
    services: [
      { id: 'svc-1', name: 'Accesso giornaliero', price: 22, isActive: true },
      { id: 'svc-2', name: 'Mensile All-in', price: 75, isActive: true },
    ],
    courses: [
      { id: 'course-1', name: 'CrossFit AM', time: '07:00', coach: 'Anna T.', spots: 4 },
      { id: 'course-2', name: 'Boxe Tecnica', time: '20:00', coach: 'Davide M.', spots: 5 },
    ],
  },
  {
    id: 'village-fit',
    name: 'Village Fit Club',
    slug: 'village-fit-club',
    type: 'gym',
    city: 'Milano',
    address: 'Navigli, Milano',
    lat: 45.4523,
    lng: 9.1756,
    rating: 4.7,
    reviewCount: 142,
    isPartner: true,
    isActive: true,
    description: 'Club fitness con focus su yoga e spa.',
    heroGradients: ['from-vfit-secondary/30 via-vfit-primary/20 to-transparent'],
    amenities: [{ kind: 'yoga' }, { kind: 'spa' }],
    hours: [{ day: 'Lun - Dom', time: '07:00 - 22:00' }],
    services: [{ id: 'svc-1', name: 'Drop-in', price: 20, isActive: true }],
    courses: [],
  },
  {
    id: 'pulse-studio',
    name: 'Pulse Studio',
    slug: 'pulse-studio',
    type: 'gym',
    city: 'Milano',
    address: 'Isola, Milano',
    lat: 45.4834,
    lng: 9.1856,
    rating: 4.6,
    reviewCount: 67,
    isPartner: false,
    isActive: true,
    description: 'Studio specializzato in Pilates e HIIT.',
    heroGradients: ['from-vfit-accent/30 via-vfit-primary/20 to-transparent'],
    amenities: [{ kind: 'pilates' }, { kind: 'cardio' }],
    hours: [{ day: 'Lun - Sab', time: '08:00 - 21:00' }],
    services: [{ id: 'svc-1', name: 'Lezione Pilates', price: 25, durationMinutes: 55, isActive: true }],
    courses: [],
  },
  {
    id: 'elite-fitness',
    name: 'Elite Fitness Center',
    slug: 'elite-fitness-center',
    type: 'gym',
    city: 'Milano',
    address: 'Brera, Milano',
    lat: 45.4701,
    lng: 9.1854,
    rating: 4.9,
    reviewCount: 215,
    isPartner: true,
    isActive: true,
    description: 'Centro premium con piscina e campi da tennis.',
    heroGradients: ['from-vfit-secondary/40 via-vfit-accent/30 to-transparent'],
    amenities: [{ kind: 'pool' }, { kind: 'tennis' }, { kind: 'spa' }],
    hours: [{ day: 'Lun - Dom', time: '06:00 - 23:00' }],
    services: [{ id: 'svc-1', name: 'Day pass', price: 35, isActive: true }],
    courses: [],
  },
  {
    id: 'power-gym',
    name: 'Power Gym Milano',
    slug: 'power-gym-milano',
    type: 'gym',
    city: 'Milano',
    address: 'Porta Romana, Milano',
    lat: 45.4456,
    lng: 9.2056,
    rating: 4.5,
    reviewCount: 89,
    isPartner: false,
    isActive: true,
    description: 'Sala pesi essenziale con focus su forza e cardio.',
    heroGradients: ['from-vfit-primary/30 via-vfit-accent/20 to-transparent'],
    amenities: [{ kind: 'weights' }, { kind: 'cardio' }],
    hours: [{ day: 'Lun - Dom', time: '06:00 - 22:00' }],
    services: [{ id: 'svc-1', name: 'Mensile', price: 39, isActive: true }],
    courses: [],
  },
];

/**
 * Seeds the deterministic sample venues used by the app's seeded demo flows.
 * Idempotent via merge: safe to run repeatedly.
 */
async function seedSampleVenues(): Promise<SeedingResult> {
  try {
    const batch = db.batch();
    const now = Timestamp.now();

    for (const v of SAMPLE_VENUES) {
      const venueRef = db.collection('venues').doc(v.id);
      const { services, courses, ...venueDoc } = v;
      batch.set(
        venueRef,
        { ...venueDoc, createdAt: now, updatedAt: now },
        { merge: true }
      );
      for (const s of services) {
        batch.set(venueRef.collection('services').doc(s.id), s, { merge: true });
      }
      for (const c of courses) {
        batch.set(venueRef.collection('courses').doc(c.id), c, { merge: true });
      }
    }

    await batch.commit();
    return { success: true, collection: 'venues (sample)', count: SAMPLE_VENUES.length };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, collection: 'venues (sample)', count: 0, error: errorMessage };
  }
}
```

- [ ] **Step 2: Lint and build the functions package**

Run: `npm --prefix functions run lint && npm --prefix functions run build`
Expected: Both succeed without errors.

- [ ] **Step 3: Commit**

```bash
git add functions/src/seed/seedData.ts
git commit -m "feat(seed): seedSampleVenues writes carosello, urban-core, and 4 demo gyms"
```

---

## Task 10: Seeder — sample instructors

**Files:**
- Modify: `functions/src/seed/seedData.ts`

- [ ] **Step 1: Add the instructor seed dataset and function**

Insert immediately after `seedSampleVenues` (still before the `seedAllData` exports):

```ts
// ===== Sample instructor seed data =====

interface SampleInstructorData {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  isActive: boolean;
  providerProfile: {
    isVerified: boolean;
    isActive: boolean;
    rating: number;
    reviewCount: number;
    specialties: string[];
    yearsOfExperience: number;
    languages: string[];
  };
  services: { id: string; name: string; description: string; durationMinutes: number; price: number; isActive: boolean }[];
}

const SAMPLE_INSTRUCTORS: SampleInstructorData[] = [
  {
    id: 'provider-1',
    fullName: 'Marco Rossi',
    avatarUrl: null,
    isActive: true,
    providerProfile: {
      isVerified: true,
      isActive: true,
      rating: 4.8,
      reviewCount: 127,
      specialties: ['Personal Training', 'Nutrizione', 'Bodybuilding'],
      yearsOfExperience: 8,
      languages: ['Italiano', 'English'],
    },
    services: [
      {
        id: 'svc-1',
        name: 'Personal Training 1-to-1',
        description: "Sessione di allenamento personalizzata in palestra o all'aperto",
        durationMinutes: 60,
        price: 60,
        isActive: true,
      },
      {
        id: 'svc-2',
        name: 'Consulenza Nutrizionale',
        description: 'Piano alimentare personalizzato e follow-up mensile',
        durationMinutes: 45,
        price: 45,
        isActive: true,
      },
    ],
  },
];

async function seedSampleInstructors(): Promise<SeedingResult> {
  try {
    const batch = db.batch();
    const now = Timestamp.now();
    for (const i of SAMPLE_INSTRUCTORS) {
      const ref = db.collection('instructors').doc(i.id);
      const { services, ...doc } = i;
      batch.set(
        ref,
        { ...doc, uid: i.id, createdAt: now, updatedAt: now },
        { merge: true }
      );
      for (const s of services) {
        batch.set(ref.collection('services').doc(s.id), s, { merge: true });
      }
    }
    await batch.commit();
    return { success: true, collection: 'instructors (sample)', count: SAMPLE_INSTRUCTORS.length };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, collection: 'instructors (sample)', count: 0, error: errorMessage };
  }
}
```

- [ ] **Step 2: Lint and build**

Run: `npm --prefix functions run lint && npm --prefix functions run build`
Expected: Success.

- [ ] **Step 3: Commit**

```bash
git add functions/src/seed/seedData.ts
git commit -m "feat(seed): seedSampleInstructors writes provider-1 with services"
```

---

## Task 11: Wire sample seeders into `seedQuickData` endpoint and deploy

**Files:**
- Modify: `functions/src/seed/seedData.ts` (the `seedQuickData` handler body)

- [ ] **Step 1: Find the existing `seedQuickData` body**

Run: `grep -n "seedQuickData" functions/src/seed/seedData.ts`
Note the line where the handler awaits its existing seed steps.

- [ ] **Step 2: Add calls to the new functions inside the handler**

Inside the handler's try-block, after the existing seed calls (do NOT remove existing calls), add:

```ts
    const sampleVenuesResult = await seedSampleVenues();
    results.push(sampleVenuesResult);

    const sampleInstructorsResult = await seedSampleInstructors();
    results.push(sampleInstructorsResult);
```

(Place adjacent to the other `results.push(...)` lines, matching the existing style. The `results` array is already declared inside the handler.)

- [ ] **Step 3: Lint and build**

Run: `npm --prefix functions run lint && npm --prefix functions run build`
Expected: Success.

- [ ] **Step 4: Deploy functions to dev project**

Run: `npm run deploy:functions`
Expected: `firebase deploy --only functions` completes; new functions appear in the Firebase Console.

- [ ] **Step 5: Run the seeder against dev Firestore**

From the Firebase Console > Functions, copy the URL for `seedQuickData`. Then:

```bash
curl -X POST -H "Authorization: Bearer $(npx firebase login:ci 2>/dev/null || echo $(gcloud auth print-identity-token))" "<seedQuickData URL>"
```

Expected: JSON response with `success: true` for each step, including `venues (sample): 6` and `instructors (sample): 1`.

Alternative (manual): open the function URL while logged into the admin account, or use the Firebase Console > Functions > "Test function" feature.

- [ ] **Step 6: Verify in Firebase Console**

Open Firestore > `venues` collection. Confirm docs `carosello`, `urban-core`, `village-fit`, `pulse-studio`, `elite-fitness`, `power-gym` exist. Open `carosello/services` and `carosello/courses` subcollections. Open `instructors/provider-1` and its `services` subcollection.

- [ ] **Step 7: Commit**

```bash
git add functions/src/seed/seedData.ts
git commit -m "feat(seed): wire sample venues + instructors into seedQuickData"
```

---

## Task 12: VenueNotFound component

**Files:**
- Create: `src/components/venue/VenueNotFound.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/venue/VenueNotFound.tsx
'use client';

import Link from 'next/link';
import { MapPinOff, ChevronLeft } from 'lucide-react';

interface VenueNotFoundProps {
  onRetry?: () => void;
  message?: string;
}

export function VenueNotFound({ onRetry, message }: VenueNotFoundProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="rounded-full bg-slate-100 p-4">
        <MapPinOff className="h-8 w-8 text-slate-500" />
      </div>
      <h2 className="text-lg font-semibold text-slate-900">
        {message ?? 'Venue non trovato'}
      </h2>
      <p className="max-w-sm text-sm text-slate-500">
        Il venue richiesto non e disponibile o e stato rimosso.
      </p>
      <div className="flex gap-2">
        <Link
          href="/fit/gyms"
          className="inline-flex h-10 items-center gap-1 rounded-full bg-vfit-accent px-4 text-sm font-medium text-white"
        >
          <ChevronLeft className="h-4 w-4" /> Sfoglia palestre
        </Link>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-10 items-center rounded-full border border-slate-200 px-4 text-sm font-medium text-slate-700"
          >
            Riprova
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/venue/VenueNotFound.tsx
git commit -m "feat(venue): inline VenueNotFound panel"
```

---

## Task 13: Switch `venue/[id]/page.tsx` to placeholder pattern

**Files:**
- Modify: `src/app/(main)/venue/[id]/page.tsx`

- [ ] **Step 1: Replace file contents**

```tsx
// src/app/(main)/venue/[id]/page.tsx
import VenueDetailClient from './VenueDetailClient';

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export default async function VenueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await params;
  return <VenueDetailClient />;
}
```

(`data.ts` is no longer imported here. The client will read `id` from `useParams()`.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors (the data.ts import in VenueDetailClient is fixed in Task 14).

- [ ] **Step 3: Commit (with Task 14 — wait to commit)**

(Skip the commit; pair this with Task 14 which removes the data.ts dependency in the client.)

---

## Task 14: Migrate `VenueDetailClient.tsx` to hooks

**Files:**
- Modify: `src/app/(main)/venue/[id]/VenueDetailClient.tsx`

- [ ] **Step 1: Replace the component implementation**

The file's current shape uses `props.id` + `venues.find(...)` from `data.ts`. New shape uses `useParams()` + Firestore hooks. Keep the same UI markup; only swap the data source and add loading/not-found states.

```tsx
// src/app/(main)/venue/[id]/VenueDetailClient.tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { ChevronLeft, Clock, MapPin, Star } from 'lucide-react';
import { cn, formatPrice } from '@/lib/utils';
import { useVenue, useVenueServices, useVenueCourses } from '@/hooks/useVenues';
import { amenityIcon } from '@/lib/icons/amenityIcons';
import { VenueNotFound } from '@/components/venue/VenueNotFound';
import { Spinner } from '@/components/ui/Spinner';

type TabOption = 'services' | 'classes';

export default function VenueDetailClient() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const venueQuery = useVenue(id);
  const servicesQuery = useVenueServices(id);
  const coursesQuery = useVenueCourses(id);

  const [activeSlide, setActiveSlide] = useState(0);
  const [showAllHours, setShowAllHours] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const [activeTab, setActiveTab] = useState<TabOption>('services');

  if (venueQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background-dark">
        <Spinner size="md" />
      </div>
    );
  }

  const venue = venueQuery.data;
  if (!venue) {
    return <VenueNotFound onRetry={() => venueQuery.refetch()} />;
  }

  const slides = venue.heroGradients ?? [];
  const services = servicesQuery.data ?? [];
  const courses = coursesQuery.data ?? [];
  const visibleHours = showAllHours ? venue.hours : venue.hours.slice(0, 1);

  return (
    <div className="min-h-screen bg-background-dark pb-24">
      <div className="relative">
        <div className="absolute left-4 top-4 z-10">
          <Link
            href="/fit/gyms"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-background-dark/80 text-text-inverse"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </div>

        {/* Hero carousel */}
        <div className="relative h-72 overflow-hidden">
          {slides.map((gradient, idx) => (
            <div
              key={idx}
              className={cn(
                'absolute inset-0 bg-gradient-to-br transition-opacity duration-500',
                gradient,
                activeSlide === idx ? 'opacity-100' : 'opacity-0'
              )}
              onClick={() => setActiveSlide((activeSlide + 1) % Math.max(slides.length, 1))}
            />
          ))}
        </div>
      </div>

      <div className="-mt-6 rounded-t-3xl bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{venue.name}</h1>
            <p className="mt-1 inline-flex items-center gap-1 text-sm text-slate-500">
              <MapPin className="h-3.5 w-3.5" />
              {venue.address}
            </p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2 py-1 text-xs font-semibold text-yellow-700">
            <Star className="h-3.5 w-3.5 fill-current" />
            {venue.rating.toFixed(1)} <span className="text-yellow-600/70">({venue.reviewCount})</span>
          </div>
        </div>

        {/* Hours */}
        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Clock className="h-4 w-4" /> Orari
          </div>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {visibleHours.map((h) => (
              <li key={h.day} className="flex justify-between">
                <span>{h.day}</span>
                <span>{h.time}</span>
              </li>
            ))}
          </ul>
          {venue.hours.length > 1 && (
            <button
              type="button"
              onClick={() => setShowAllHours((v) => !v)}
              className="mt-2 text-xs font-medium text-vfit-accent"
            >
              {showAllHours ? 'Mostra meno' : `Tutti gli orari (${venue.hours.length})`}
            </button>
          )}
        </div>

        {/* Amenities */}
        <div className="mt-4 flex flex-wrap gap-2">
          {venue.amenities.map((a) => {
            const Icon = amenityIcon(a.kind);
            return (
              <span
                key={a.kind}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
              >
                <Icon className="h-3.5 w-3.5" /> {a.kind.replace(/_/g, ' ')}
              </span>
            );
          })}
        </div>

        {/* Description */}
        <p className={cn('mt-4 text-sm text-slate-600', !showDescription && 'line-clamp-3')}>
          {venue.description}
        </p>
        {venue.description.length > 160 && (
          <button
            type="button"
            onClick={() => setShowDescription((v) => !v)}
            className="mt-1 text-xs font-medium text-vfit-accent"
          >
            {showDescription ? 'Mostra meno' : 'Leggi tutto'}
          </button>
        )}

        {/* Tabs */}
        <div className="mt-6 flex gap-2 border-b border-slate-100">
          <button
            type="button"
            onClick={() => setActiveTab('services')}
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium',
              activeTab === 'services'
                ? 'border-vfit-accent text-vfit-accent'
                : 'border-transparent text-slate-500'
            )}
          >
            Servizi
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('classes')}
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium',
              activeTab === 'classes'
                ? 'border-vfit-accent text-vfit-accent'
                : 'border-transparent text-slate-500'
            )}
          >
            Corsi
          </button>
        </div>

        {activeTab === 'services' && (
          <ul className="mt-3 space-y-2">
            {servicesQuery.isLoading && <Spinner size="sm" />}
            {services.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-3"
              >
                <span className="text-sm font-medium text-slate-800">{s.name}</span>
                <span className="text-sm font-semibold text-slate-900">{formatPrice(s.price)}</span>
              </li>
            ))}
            {!servicesQuery.isLoading && services.length === 0 && (
              <li className="text-sm text-slate-500">Nessun servizio disponibile.</li>
            )}
          </ul>
        )}

        {activeTab === 'classes' && (
          <ul className="mt-3 space-y-2">
            {coursesQuery.isLoading && <Spinner size="sm" />}
            {courses.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                  <p className="text-xs text-slate-500">
                    {c.time} · {c.coach}
                  </p>
                </div>
                <span className="text-xs font-medium text-slate-700">{c.spots} posti</span>
              </li>
            ))}
            {!coursesQuery.isLoading && courses.length === 0 && (
              <li className="text-sm text-slate-500">Nessun corso programmato.</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
```

Note: This intentionally preserves the existing visual structure but is simpler than the previous version (the carousel auto-rotation, ChevronLeft slider buttons, and "tab" styling were already heavy). Verify visually against the current page screenshot in step 4.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Run dev server and verify visually**

Run: `npm run dev` (if not already running).
Visit `http://localhost:3000/venue/carosello/`. Expect the Carosello card to load, services tab to show 3 services, courses tab to show 3 courses, hours collapsed by default.

Visit `http://localhost:3000/venue/does-not-exist/`. Expect `<VenueNotFound />` to render with "Sfoglia palestre" button linking to `/fit/gyms`.

- [ ] **Step 4: Commit (combined with Task 13)**

```bash
git add src/app/'(main)'/venue/'[id]'/page.tsx src/app/'(main)'/venue/'[id]'/VenueDetailClient.tsx
git commit -m "$(cat <<'EOF'
feat(venue): fetch venue, services, courses from Firestore

Switches /venue/[id] to the placeholder generateStaticParams pattern
used elsewhere in the app. Client component reads id via useParams()
and pulls venue + services + courses through TanStack Query hooks.
Removes the data.ts coupling; unknown IDs now render VenueNotFound
instead of throwing.
EOF
)"
```

---

## Task 15: Delete `venue/[id]/data.ts` and update e2e test

**Files:**
- Delete: `src/app/(main)/venue/[id]/data.ts`
- Modify: `e2e/venue.spec.ts`

- [ ] **Step 1: Confirm no lingering imports**

Run: `grep -rn "from './data'\|from '@/app/(main)/venue/\[id\]/data'" src/ | grep -v node_modules`
Expected: No matches.

- [ ] **Step 2: Delete the file**

Run: `git rm 'src/app/(main)/venue/[id]/data.ts'`

- [ ] **Step 3: Update e2e test to tolerate either auth-gated or signed-in run**

```ts
// e2e/venue.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Venue Detail Page', () => {
  test('Carosello Fitness page does not show "missing param" runtime error', async ({ page }) => {
    await page.goto('/venue/carosello/');
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('missing param');
    expect(bodyText).not.toContain('Runtime Error');
  });

  test('Urban Core Gym page does not show "missing param" runtime error', async ({ page }) => {
    await page.goto('/venue/urban-core/');
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('missing param');
    expect(bodyText).not.toContain('Runtime Error');
  });

  test('Unknown venue id renders the not-found panel without runtime error', async ({ page }) => {
    await page.goto('/venue/this-does-not-exist/');
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('missing param');
    expect(bodyText).not.toContain('Runtime Error');
  });
});
```

The previous `expect(page.locator('h1')).toContainText('Carosello Fitness')` is removed because the e2e session is unauthenticated, and `(main)/layout.tsx` shows the Welcome screen until auth resolves. The runtime-error assertion is the contract this task actually owns.

- [ ] **Step 4: Run e2e**

Run: `npx playwright test e2e/venue.spec.ts --reporter=list`
Expected: 3 tests pass on chromium (and mobile-chrome / mobile-safari if configured).

- [ ] **Step 5: Commit**

```bash
git add e2e/venue.spec.ts 'src/app/(main)/venue/[id]/data.ts'
git commit -m "$(cat <<'EOF'
refactor(venue): drop data.ts and align e2e on missing-param contract

The venue detail page now pulls from Firestore; the local data.ts
fixture is no longer referenced. e2e tests no longer assert the
heading (gated behind auth in the test browser) and instead guarantee
the absence of the "missing param" runtime error and the inline 404
panel for unknown IDs.
EOF
)"
```

---

## Task 16: Migrate `fit/gyms/page.tsx`

**Files:**
- Modify: `src/app/(main)/fit/gyms/page.tsx`

- [ ] **Step 1: Replace the inline `gyms = [...]` array with a hook call**

Open `src/app/(main)/fit/gyms/page.tsx`. Remove lines 12-90 (the inline `gyms` array). Replace with hook usage at the top of the default-exported component body.

Find this line (around line 12):
```ts
const gyms = [
  { id: 'carosello', /* ... */ },
  /* ... */
];
```

Delete the array. Inside the component (typically `export default function GymsPage()`), add at the top:

```ts
import { useVenues } from '@/hooks/useVenues';
import { Spinner } from '@/components/ui/Spinner';
// ...

const { data: gyms = [], isLoading: gymsLoading } = useVenues({ type: 'gym' });
```

Below any guard for `isLoading`, conditionally render:

```tsx
{gymsLoading ? <Spinner size="md" /> : (
  /* existing list JSX, unchanged, using `gyms` from the hook */
)}
```

The existing JSX already destructures `gym.id`, `gym.name`, `gym.city`, `gym.rating`, `gym.reviews`, `gym.amenities`, `gym.distanceKm`, `gym.priceLevel`, `gym.partner`, `gym.lat`, `gym.lng`. The Firestore `Venue` type uses `reviewCount` (not `reviews`) and lacks `distanceKm` / `priceLevel`. Adjust references in the JSX:

- `gym.reviews` → `gym.reviewCount`
- `gym.distanceKm` → remove the display or render `"—"` (geo-distance calculation is out of scope)
- `gym.priceLevel` → remove the display (not in schema)
- `gym.partner` → `gym.isPartner`

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Manual smoke**

In `npm run dev`, visit `/fit/gyms`. Expect 6 gyms from Firestore to render. The map markers should still place at the seeded `lat`/`lng`. Clicking a gym card routes to `/venue/{id}/` and that page renders the seeded venue.

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(main)/fit/gyms/page.tsx'
git commit -m "$(cat <<'EOF'
refactor(fit): list gyms from Firestore via useVenues

Drops the inline gyms array. The map and list both consume the
shared useVenues({ type: 'gym' }) hook, sharing cache with the home
page and the admin view. Visual fields not in the venue schema
(distanceKm, priceLevel) are removed; reviews -> reviewCount and
partner -> isPartner are renamed in the JSX.
EOF
)"
```

---

## Task 17: Migrate `booking/[providerId]/BookingClient.tsx`

**Files:**
- Modify: `src/app/booking/[providerId]/BookingClient.tsx`

- [ ] **Step 1: Replace `MOCK_PROVIDER` with hooks**

Open `BookingClient.tsx`. Find and delete the `const MOCK_PROVIDER: ProviderSearchResult = { ... }` block (around lines 28-80).

Add imports near the top:

```ts
import { useProvider, useProviderServices } from '@/hooks/useProviders';
```

Inside the component body, replace any reference to `MOCK_PROVIDER` with hook data:

```ts
const params = useParams<{ providerId: string }>();
const providerId = params?.providerId;

const { data: provider, isLoading: providerLoading } = useProvider(providerId);
const { data: services = [], isLoading: servicesLoading } = useProviderServices(providerId);
```

In the rendered output, gate the existing JSX on `providerLoading`/`!provider`. The existing JSX uses fields like `MOCK_PROVIDER.fullName`, `MOCK_PROVIDER.rating`, `MOCK_PROVIDER.specialties`, `MOCK_PROVIDER.services`. Replace those references with `provider.fullName`, `provider.rating`, etc., and `services` from the services hook.

If `provider` is `null` after loading, render the `<VenueNotFound message="Provider non trovato" />` component (path: `@/components/venue/VenueNotFound`) as a generic not-found state. (We accept reusing the venue-named component here to avoid creating a parallel `<ProviderNotFound />` — the visual is generic.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors. (The `ProviderSearchResult` import from `@/types/booking` may still be used elsewhere in the file; leave the import if so.)

- [ ] **Step 3: Manual smoke**

In `npm run dev`, with an authenticated test user, visit `/booking/provider-1`. Expect Marco Rossi's profile and 2 services to render from Firestore.

- [ ] **Step 4: Commit**

```bash
git add src/app/booking/'[providerId]'/BookingClient.tsx
git commit -m "$(cat <<'EOF'
refactor(booking): fetch provider + services from Firestore

Replaces the MOCK_PROVIDER constant with useProvider(providerId) and
useProviderServices(providerId). Reuses the inline not-found panel
for missing providers.
EOF
)"
```

---

## Task 18: Migrate `admin/venues/page.tsx`

**Files:**
- Modify: `src/app/admin/venues/page.tsx`

- [ ] **Step 1: Replace the inline mock array with the venue hook**

Open `src/app/admin/venues/page.tsx`. Locate the `// Mock data` block defining `const venues: Venue[] = [ ... ]` (around line 36).

Delete the inline array. Add the hook:

```ts
import { useVenues } from '@/hooks/useVenues';
import { Spinner } from '@/components/ui/Spinner';
// ...

const { data: venues = [], isLoading } = useVenues({});
```

The admin page's local `interface Venue { ... }` (with `createdAt: Date`, `phone: string`) differs from the Firestore `Venue` type. Two choices:

(a) **Map at the boundary** (recommended): keep the local `Venue` interface for the table, then map:

```ts
const tableRows = venues.map((v) => ({
  id: v.id,
  name: v.name,
  type: v.type,
  address: v.address,
  city: v.city,
  phone: '', // not in venue schema; leave empty for now
  rating: v.rating,
  reviewCount: v.reviewCount,
  isActive: v.isActive,
  isPartner: v.isPartner,
  createdAt: v.createdAt?.toDate?.() ?? new Date(),
}));
```

Pass `tableRows` to `<DataTable rows={tableRows} columns={columns} />`.

(b) **Replace the local interface** with the shared `Venue` type and remove the `phone` column from `columns`. More invasive; defer unless `phone` is clearly out of scope.

Use (a).

Add a `{isLoading && <Spinner size="md" />}` above the table.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Manual smoke**

As an admin user, visit `/admin/venues`. Expect the seeded venues to appear in the table.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/venues/page.tsx
git commit -m "refactor(admin): list venues from Firestore via useVenues"
```

---

## Task 19: Refactor `home/page.tsx` inline hooks to shared hooks

**Files:**
- Modify: `src/app/(main)/home/page.tsx`

- [ ] **Step 1: Replace `useVenuesByType` calls with `useVenues`**

Locate the inline `function useVenuesByType(...) { ... }` (line 231) and its call sites (line 361 and line 844).

Remove the inline function definition entirely. Replace each call site with:

```ts
// Was: const { venues: gyms, isLoading: loadingGyms } = useVenuesByType({ type: 'gym', limit: 4 });
const { data: gyms = [], isLoading: loadingGyms } = useVenues({ type: 'gym', limit: 4 });

// Was: const { venues: centers, isLoading: loadingCenters } = useVenuesByType({ type: 'wellness_center', limit: 2 });
const { data: centers = [], isLoading: loadingCenters } = useVenues({ type: 'wellness_center', limit: 2 });
```

Add at top of file:
```ts
import { useVenues } from '@/hooks/useVenues';
import { useProviders } from '@/hooks/useProviders';
```

- [ ] **Step 2: Replace `useTopProviders` with `useProviders`**

Locate the inline `function useTopProviders(...)` (line 175). Remove it. Replace its call site (line 357):

```ts
// Was: const { providers: trainers, isLoading: loadingTrainers } = useTopProviders(6, t('home.fit.trainers.unknownName'));
const { data: trainers = [], isLoading: loadingTrainers } = useProviders({ onlyVerified: true, limit: 6 });
```

The `Provider` type's `fullName` already falls back to `'Provider'` literal; if the existing JSX uses an i18n `unknownName`, replace the provider name display: `trainer.fullName ?? t('home.fit.trainers.unknownName')`.

- [ ] **Step 3: Leave `useTodayClasses` and `useTestimonials` alone (out of scope)**

These two inline hooks fetch from `fitnessClasses` and a testimonials source respectively; migrating them properly requires types and accessors for those collections, which are not part of this plan. Leave the inline definitions in place for now and add a comment:

```ts
// TODO(fake-data-migration): extract to shared hooks once class + testimonials types are defined.
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Manual smoke**

Visit `http://localhost:3000/`. Verify Gyms strip, Centers strip, and Top Trainers strip all render. Clicking a gym card routes to its Firestore-backed detail page.

- [ ] **Step 6: Commit**

```bash
git add 'src/app/(main)/home/page.tsx'
git commit -m "$(cat <<'EOF'
refactor(home): consume shared venue + provider hooks

Replaces inline useVenuesByType and useTopProviders with the shared
TanStack hooks. useTodayClasses and useTestimonials are deferred —
their underlying collections need a follow-up migration of their own.
EOF
)"
```

---

## Task 20: Delete `src/lib/mockData.ts`

**Files:**
- Delete: `src/lib/mockData.ts`

- [ ] **Step 1: Confirm no consumers**

Run: `grep -rn "from '@/lib/mockData'\|from '\.\./lib/mockData'\|from '\./mockData'" src/ functions/ e2e/ 2>/dev/null`
Expected: No matches. (If any appear, replace those consumers with shared hooks before deletion.)

- [ ] **Step 2: Delete**

Run: `git rm src/lib/mockData.ts`

- [ ] **Step 3: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: No errors. The static export should succeed and produce `out/`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/mockData.ts
git commit -m "chore: remove unused mockData.ts (no consumers)"
```

---

## Task 21: Final verification

**Files:**
- (Verification only — no edits)

- [ ] **Step 1: Run all unit tests**

Run: `npm test -- --run`
Expected: All tests pass, including the new `venues.test.ts` and `providers.test.ts`.

- [ ] **Step 2: Run e2e tests**

Run: `npx playwright test --reporter=list`
Expected: `e2e/venue.spec.ts` passes (3 tests × however many browsers configured).

- [ ] **Step 3: Build for production**

Run: `npm run build`
Expected: Next static export completes; `out/` contains `venue/placeholder/index.html`, `fit/gyms/index.html`, `admin/venues/index.html`. No "missing param" build error.

- [ ] **Step 4: Capacitor sync sanity check**

Run: `npx cap sync`
Expected: Sync completes. The static export still works as the Capacitor web asset bundle.

- [ ] **Step 5: Manual end-to-end walk**

With the dev server running and seed data deployed:

1. Open `/` → home page renders trainers, gyms, centers from Firestore
2. Click a gym → `/venue/{id}/` renders from Firestore via `useVenue`
3. Visit `/fit/gyms` → 6 seeded gyms appear
4. (Signed in) visit `/booking/provider-1` → Marco Rossi profile loads from Firestore
5. (As admin) visit `/admin/venues` → 6 venues listed in admin table
6. Visit `/venue/does-not-exist/` → VenueNotFound panel renders, no runtime error

- [ ] **Step 6: Final commit (only if any cleanup edits)**

Only commit if step 5 surfaced a polish item. Otherwise this task is complete with no new commit.

---

## Self-review summary

**Spec coverage:**
- Step 0 firestore rules → Task 1 ✓
- New data layer (types + accessors + hooks + registry) → Tasks 2-8 ✓
- Seeding extension → Tasks 9-11 ✓
- VenueNotFound → Task 12 ✓
- venue/[id] migration → Tasks 13-15 ✓
- fit/gyms migration → Task 16 ✓
- booking/[providerId] migration → Task 17 ✓
- admin/venues migration → Task 18 ✓
- home/page.tsx refactor → Task 19 ✓
- mockData.ts delete → Task 20 ✓
- Build/test verification → Task 21 ✓

**Type consistency check:**
- `Venue` shape matches between `src/types/venue.ts` (Task 2) and consumer references (Tasks 13-18). `reviewCount` (not `reviews`), `isPartner` (not `partner`), `amenities: AmenityRef[]` (not `string[]`), `heroGradients: string[]` (not `hero`). The migration of `fit/gyms` (Task 16) explicitly maps the legacy field names.
- `Provider` shape matches between `src/types/instructor.ts` (Task 3) and consumers (Tasks 8, 17, 19).
- `AmenityKind` literal union in `src/types/venue.ts` (Task 2) matches all keys in `AMENITY_ICONS` (Task 4).

**Placeholder scan:**
- No "TBD" / "implement later" / hand-wavy steps. Each step shows the code or runs a concrete command with expected output.
- One explicit TODO comment is added in `home/page.tsx` (Task 19, step 3) to flag `useTodayClasses`/`useTestimonials` as future work — this is intentional and documented in the spec as out-of-scope.

**Bite-size check:**
- Each task is ≤ ~30 minutes of focused work, with the heaviest being Task 14 (VenueDetailClient rewrite) and Task 11 (seed deploy + verify). All other tasks are ≤ 10 minutes.

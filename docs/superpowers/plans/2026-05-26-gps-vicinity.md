# GPS Positioning + Vicinity Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give providers GPS coordinates, make the map position venues/providers at their real coords, and add "near me" vicinity filtering (distance labels, nearest sort, radius cutoff) on the gyms and booking pages.

**Architecture:** Shared pure geo helpers (`src/lib/geo.ts`) + a `useNearMe` hook + a `RadiusFilter` component, consumed identically by `fit/gyms` (venues, already have coords) and `booking` (providers, coords seeded). Distance/sort/filter is page-side so both surfaces share one code path. The seeder derives provider coords from each instructor's city.

**Tech Stack:** Next.js 16 · React 19 · TanStack Query v5 · Firebase v12 · @react-google-maps/api · Vitest

**Spec:** `docs/superpowers/specs/2026-05-26-gps-vicinity-design.md`

---

## File Structure

### New
| Path | Responsibility |
|---|---|
| `src/lib/geo.ts` | `haversineKm`, `annotateAndSortByDistance`, `filterByRadius`, `LatLng` type |
| `src/lib/geo.test.ts` | Vitest tests for geo helpers |
| `src/hooks/useNearMe.ts` | Geolocation request + radius state hook |
| `src/hooks/useNearMe.test.ts` | Vitest test (mocked geolocation) |
| `src/components/map/RadiusFilter.tsx` | "Near me" button + radius chips UI |
| `functions/scripts/run-seed-coords.mjs` | Local runner for the coord seed |

### Modified
| Path | Change |
|---|---|
| `src/types/instructor.ts` | Add `lat?`, `lng?` to `Provider` |
| `src/lib/firebase/providers.ts` | Map `lat`/`lng` in `flattenProvider` |
| `src/lib/firebookings.ts` | Populate `location` in `searchProviders`; remove dead `calculateDistance` + in-fn distance/sort |
| `src/components/map/GoogleMap.tsx` | Real-coord markers, skip missing, "you are here" marker, markers re-render on `gyms` change |
| `src/app/(main)/fit/gyms/page.tsx` | `useNearMe` + `RadiusFilter` + distance annotate/filter/labels |
| `src/app/(main)/booking/page.tsx` | `useNearMe` + `RadiusFilter` + distance annotate/filter/labels |
| `functions/src/seed/seedData.ts` | Lift `DEMO_CITY_COORDS` to module scope; add `generateDemoProviderCoords` |

---

## Task 1: Geo helpers (TDD)

**Files:**
- Create: `src/lib/geo.ts`
- Create: `src/lib/geo.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/geo.test.ts
import { describe, it, expect } from 'vitest';
import { haversineKm, annotateAndSortByDistance, filterByRadius } from './geo';

describe('haversineKm', () => {
  it('computes Milano↔Roma ≈ 477 km', () => {
    const milano = { lat: 45.4642, lng: 9.19 };
    const roma = { lat: 41.9028, lng: 12.4964 };
    const d = haversineKm(milano, roma);
    expect(d).toBeGreaterThan(450);
    expect(d).toBeLessThan(500);
  });

  it('is zero for identical points', () => {
    const p = { lat: 45, lng: 9 };
    expect(haversineKm(p, p)).toBeCloseTo(0, 5);
  });
});

describe('annotateAndSortByDistance', () => {
  const from = { lat: 45.4642, lng: 9.19 }; // Milano
  it('sorts nearest-first and adds distanceKm', () => {
    const items = [
      { id: 'roma', lat: 41.9028, lng: 12.4964 },
      { id: 'milano2', lat: 45.47, lng: 9.2 },
    ];
    const out = annotateAndSortByDistance(items, from, (i) => ({ lat: i.lat, lng: i.lng }));
    expect(out[0].id).toBe('milano2');
    expect(out[1].id).toBe('roma');
    expect(out[0].distanceKm).toBeLessThan(out[1].distanceKm);
  });

  it('puts items with null coords last with Infinity', () => {
    const items = [
      { id: 'a', lat: null as number | null, lng: null as number | null },
      { id: 'b', lat: 45.47, lng: 9.2 },
    ];
    const out = annotateAndSortByDistance(items, from, (i) =>
      i.lat != null && i.lng != null ? { lat: i.lat, lng: i.lng } : null
    );
    expect(out[0].id).toBe('b');
    expect(out[1].id).toBe('a');
    expect(out[1].distanceKm).toBe(Infinity);
  });
});

describe('filterByRadius', () => {
  it('keeps in-radius, drops out-of-radius and Infinity', () => {
    const items = [
      { id: 'near', distanceKm: 3 },
      { id: 'far', distanceKm: 40 },
      { id: 'none', distanceKm: Infinity },
    ];
    const out = filterByRadius(items, 10);
    expect(out.map((i) => i.id)).toEqual(['near']);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npx vitest run src/lib/geo.test.ts`
Expected: FAIL — "Cannot find module './geo'"

- [ ] **Step 3: Implement**

```ts
// src/lib/geo.ts
export interface LatLng {
  lat: number;
  lng: number;
}

/** Great-circle distance in kilometers (Haversine). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371; // Earth radius km
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Annotate each item with `distanceKm` from `from` and return a NEW array
 * sorted nearest-first. Items whose `getCoords` returns null get
 * distanceKm = Infinity and sort last.
 */
export function annotateAndSortByDistance<T>(
  items: T[],
  from: LatLng,
  getCoords: (item: T) => LatLng | null
): (T & { distanceKm: number })[] {
  return items
    .map((item) => {
      const coords = getCoords(item);
      const distanceKm = coords ? haversineKm(from, coords) : Infinity;
      return { ...item, distanceKm };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/** Keep only items within `radiusKm` (drops Infinity/out-of-range). */
export function filterByRadius<T extends { distanceKm: number }>(
  items: T[],
  radiusKm: number
): T[] {
  return items.filter((i) => i.distanceKm <= radiusKm);
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run src/lib/geo.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/geo.ts src/lib/geo.test.ts
git commit -m "feat(geo): haversineKm + annotateAndSortByDistance + filterByRadius helpers"
```

---

## Task 2: useNearMe hook (TDD)

**Files:**
- Create: `src/hooks/useNearMe.ts`
- Create: `src/hooks/useNearMe.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/hooks/useNearMe.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useNearMe } from './useNearMe';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('useNearMe', () => {
  it('defaults to no location and radius 25', () => {
    const { result } = renderHook(() => useNearMe());
    expect(result.current.userLocation).toBeNull();
    expect(result.current.radiusKm).toBe(25);
  });

  it('sets userLocation on geolocation success', async () => {
    const getCurrentPosition = vi.fn((ok) =>
      ok({ coords: { latitude: 45.46, longitude: 9.19 } })
    );
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });

    const { result } = renderHook(() => useNearMe());
    act(() => result.current.requestLocation());

    await waitFor(() => expect(result.current.userLocation).toEqual({ lat: 45.46, lng: 9.19 }));
    expect(result.current.error).toBeNull();
  });

  it('sets error on geolocation failure', async () => {
    const getCurrentPosition = vi.fn((_ok, err) => err({ message: 'denied' }));
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });

    const { result } = renderHook(() => useNearMe());
    act(() => result.current.requestLocation());

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.userLocation).toBeNull();
  });

  it('clearLocation resets userLocation', async () => {
    const getCurrentPosition = vi.fn((ok) =>
      ok({ coords: { latitude: 1, longitude: 2 } })
    );
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    const { result } = renderHook(() => useNearMe());
    act(() => result.current.requestLocation());
    await waitFor(() => expect(result.current.userLocation).not.toBeNull());
    act(() => result.current.clearLocation());
    expect(result.current.userLocation).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npx vitest run src/hooks/useNearMe.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

```ts
// src/hooks/useNearMe.ts
import { useCallback, useState } from 'react';
import type { LatLng } from '@/lib/geo';

export type RadiusKm = 5 | 10 | 25 | 50 | null; // null = "Tutti"

export interface UseNearMe {
  userLocation: LatLng | null;
  radiusKm: RadiusKm;
  isLocating: boolean;
  error: string | null;
  requestLocation: () => void;
  clearLocation: () => void;
  setRadiusKm: (r: RadiusKm) => void;
}

export function useNearMe(): UseNearMe {
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [radiusKm, setRadiusKm] = useState<RadiusKm>(25);
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Geolocalizzazione non supportata');
      return;
    }
    setIsLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setIsLocating(false);
      },
      (err) => {
        setError(err?.message || 'Posizione non disponibile');
        setUserLocation(null);
        setIsLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  const clearLocation = useCallback(() => {
    setUserLocation(null);
    setError(null);
  }, []);

  return { userLocation, radiusKm, isLocating, error, requestLocation, clearLocation, setRadiusKm };
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run src/hooks/useNearMe.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useNearMe.ts src/hooks/useNearMe.test.ts
git commit -m "feat(hooks): useNearMe — geolocation request + radius state"
```

---

## Task 3: RadiusFilter component

**Files:**
- Create: `src/components/map/RadiusFilter.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/map/RadiusFilter.tsx
'use client';
import { MapPin, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LatLng } from '@/lib/geo';
import type { RadiusKm } from '@/hooks/useNearMe';

interface RadiusFilterProps {
  userLocation: LatLng | null;
  radiusKm: RadiusKm;
  isLocating: boolean;
  error: string | null;
  onRequestLocation: () => void;
  onClearLocation: () => void;
  onRadiusChange: (r: RadiusKm) => void;
  className?: string;
}

const RADIUS_OPTIONS: RadiusKm[] = [5, 10, 25, 50, null];

export function RadiusFilter({
  userLocation,
  radiusKm,
  isLocating,
  error,
  onRequestLocation,
  onClearLocation,
  onRadiusChange,
  className,
}: RadiusFilterProps) {
  if (!userLocation) {
    return (
      <div className={cn('space-y-1', className)}>
        <button
          type="button"
          onClick={onRequestLocation}
          disabled={isLocating}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-text-tertiary hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          {isLocating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
          Vicino a me
        </button>
        {error && <p className="text-[11px] text-text-tertiary">Posizione non disponibile</p>}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {RADIUS_OPTIONS.map((r) => (
        <button
          key={r ?? 'all'}
          type="button"
          onClick={() => onRadiusChange(r)}
          className={cn(
            'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
            radiusKm === r
              ? 'bg-section-primary text-background-dark'
              : 'border border-white/10 bg-white/5 text-text-tertiary hover:bg-white/10'
          )}
        >
          {r === null ? 'Tutti' : `${r} km`}
        </button>
      ))}
      <button
        type="button"
        onClick={onClearLocation}
        className="inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-xs text-text-tertiary hover:text-white"
        aria-label="Disattiva posizione"
      >
        <X className="h-3.5 w-3.5" /> Disattiva
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/map/RadiusFilter.tsx
git commit -m "feat(map): RadiusFilter — near-me button + radius chips"
```

---

## Task 4: Provider coordinate types + accessor

**Files:**
- Modify: `src/types/instructor.ts`
- Modify: `src/lib/firebase/providers.ts`

- [ ] **Step 1: Add lat/lng to Provider**

In `src/types/instructor.ts`, in the `Provider` interface, add after `city?: string;`:

```ts
  lat?: number;
  lng?: number;
```

- [ ] **Step 2: Map them in flattenProvider**

In `src/lib/firebase/providers.ts`, inside `flattenProvider`'s returned object, add after the `city:` line:

```ts
    lat: typeof data.lat === 'number' ? (data.lat as number) : undefined,
    lng: typeof data.lng === 'number' ? (data.lng as number) : undefined,
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/instructor.ts src/lib/firebase/providers.ts
git commit -m "feat(types): Provider lat/lng + flattenProvider mapping"
```

---

## Task 5: Populate location in searchProviders; remove dead distance code

**Files:**
- Modify: `src/lib/firebookings.ts`

- [ ] **Step 1: Populate location in the result map**

In `src/lib/firebookings.ts`, inside `searchProviders`'s `snapshot.docs.map((doc) => {...})`, add to the returned object (near the `lowestPrice` line):

```ts
      location:
        typeof data.lat === 'number' && typeof data.lng === 'number'
          ? { lat: data.lat, lng: data.lng, address: (data.city as string) ?? '' }
          : undefined,
```

- [ ] **Step 2: Remove the in-function distance computation**

Delete the block (around lines 109-116) that starts with:

```ts
  // Calculate distance if location provided
  if (params.location && providers.some((p) => p.location)) {
    providers = providers.map((p) => {
      ...
    });
  }
```

- [ ] **Step 3: Remove the `case 'distance'` sort branch**

In the `if (params.sortBy) { switch (params.sortBy) {...} }` block, delete the `case 'distance':` branch (the one doing `providers.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));`). Leave the other cases.

- [ ] **Step 4: Remove the `calculateDistance` helper**

Delete the entire `function calculateDistance(lat1, lon1, lat2, lon2) { ... }` definition (around line 187).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors. (If TS flags `params.location` now unused, that's fine — leave `SearchParams.location` on the type for the page to still set if needed; it's just no longer read here. If an "unused" error appears for an import like a removed helper, clean it up.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/firebookings.ts
git commit -m "refactor(booking): searchProviders populates location; drop dead distance/sort"
```

---

## Task 6: Seed provider coordinates

**Files:**
- Modify: `functions/src/seed/seedData.ts`
- Create: `functions/scripts/run-seed-coords.mjs`

- [ ] **Step 1: Lift DEMO_CITIES to a module-scope constant**

In `functions/src/seed/seedData.ts`, the `DEMO_CITIES` array is currently declared inside `generateDemoData` (around line 934). Add a module-scope constant near the top-level constants (after `CITIES`/`NEIGHBORHOODS`):

```ts
const DEMO_CITY_COORDS: { name: string; lat: number; lng: number }[] = [
  { name: 'Milano', lat: 45.4642, lng: 9.19 },
  { name: 'Roma', lat: 41.9028, lng: 12.4964 },
  { name: 'Torino', lat: 45.0703, lng: 7.6869 },
  { name: 'Bologna', lat: 44.4949, lng: 11.3426 },
  { name: 'Firenze', lat: 43.7696, lng: 11.2558 },
  { name: 'Napoli', lat: 40.8518, lng: 14.2681 },
  { name: 'Venezia', lat: 45.4408, lng: 12.3155 },
  { name: 'Verona', lat: 45.4384, lng: 10.9916 },
  { name: 'Genova', lat: 44.4056, lng: 8.9463 },
  { name: 'Bari', lat: 41.1171, lng: 16.8719 },
  { name: 'Palermo', lat: 38.1157, lng: 13.3615 },
  { name: 'Catania', lat: 37.5079, lng: 15.083 },
];
```

(Leave the existing in-function `DEMO_CITIES` as-is to avoid disturbing `generateDemoData`; the new constant is dedicated to coord lookups. Both having the same data is acceptable — do NOT refactor `generateDemoData` here.)

- [ ] **Step 2: Add generateDemoProviderCoords**

Add this exported function after `generateDemoProviderPrices` (find it: `grep -n "export async function generateDemoProviderPrices" functions/src/seed/seedData.ts`, insert after its closing brace):

```ts
function cityCoords(city: string): { lat: number; lng: number } {
  const found = DEMO_CITY_COORDS.find((c) => c.name === city);
  return found ?? DEMO_CITY_COORDS[0]; // default Milano
}

export async function generateDemoProviderCoords(): Promise<SeedingResult[]> {
  const results: SeedingResult[] = [];
  try {
    const snap = await db.collection('instructors').get();
    let batch = db.batch();
    let opCount = 0;
    let total = 0;
    for (const docSnap of snap.docs) {
      const city = (docSnap.data().city as string) ?? 'Milano';
      const base = cityCoords(city);
      // deterministic jitter from id hash, ±0.02 deg
      let seed = 0;
      const id = docSnap.id;
      for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
      const jLat = (((seed % 1000) / 1000) - 0.5) * 0.04;
      const jLng = ((((seed >> 10) % 1000) / 1000) - 0.5) * 0.04;
      const lat = base.lat + jLat;
      const lng = base.lng + jLng;
      batch.set(docSnap.ref, { lat, lng }, { merge: true });
      opCount++;
      total++;
      if (opCount >= 400) {
        await batch.commit();
        batch = db.batch();
        opCount = 0;
      }
    }
    if (opCount > 0) await batch.commit();
    results.push({ success: true, collection: 'instructors (coords)', count: total });
  } catch (error) {
    results.push({
      success: false,
      collection: 'instructors (coords)',
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown',
    });
  }
  return results;
}
```

- [ ] **Step 2b: Use double quotes if the functions eslint requires it**

The functions package enforces double quotes. Convert single quotes to double quotes in your added code to satisfy `npm --prefix functions run lint`.

- [ ] **Step 3: Build + lint**

Run: `npm --prefix functions run build && npm --prefix functions run lint`
Expected: both succeed.

- [ ] **Step 4: Create the local-run script**

```js
// functions/scripts/run-seed-coords.mjs
import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'vfit-funlife' });
const mod = await import('../lib/seed/seedData.js');

console.log('[seed-coords] Starting generateDemoProviderCoords...');
const start = Date.now();
const results = await mod.generateDemoProviderCoords();
console.log(`[seed-coords] Done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
console.log(JSON.stringify(results, null, 2));
process.exit(0);
```

- [ ] **Step 5: Run the seed**

```bash
cd /Users/hidranarias/projects/vfit/functions
GOOGLE_APPLICATION_CREDENTIALS=~/.config/firebase-cli-adc.json GOOGLE_CLOUD_PROJECT=vfit-funlife node scripts/run-seed-coords.mjs
```

Expected: `{ "success": true, "collection": "instructors (coords)", "count": 321 }`.

- [ ] **Step 6: Commit**

```bash
git add functions/src/seed/seedData.ts functions/scripts/run-seed-coords.mjs
git commit -m "feat(seed): generateDemoProviderCoords — city-derived lat/lng for instructors"
```

---

## Task 7: GoogleMap — real coords, user marker, re-render on filter

**Files:**
- Modify: `src/components/map/GoogleMap.tsx`

Read the file first — it's ~250 lines with a Google Maps lifecycle. Make these targeted changes:

- [ ] **Step 1: Skip the mock-coordinate fallback**

Find the marker loop (around line 154-160):

```ts
    gyms.forEach((gym, index) => {
      const coords = gym.lat && gym.lng
        ? { lat: gym.lat, lng: gym.lng }
        : getGymCoordinates(gym.id, index);
```

Replace with a skip-when-missing guard:

```ts
    gyms.forEach((gym) => {
      if (typeof gym.lat !== 'number' || typeof gym.lng !== 'number') return;
      const coords = { lat: gym.lat, lng: gym.lng };
```

Then delete the now-unused `getGymCoordinates` function definition (top of file, ~line 26-40).

- [ ] **Step 2: Add a "you are here" marker for userLocation**

Inside the same effect, after the `gyms.forEach(...)` marker loop completes (and after `bounds.extend` calls), add a user marker when `userLocation` is set:

```ts
      if (userLocation) {
        const userMarker = new google.maps.Marker({
          position: new google.maps.LatLng(userLocation.lat, userLocation.lng),
          map: googleMapRef.current,
          title: 'La tua posizione',
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#2563eb',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
          zIndex: 9999,
        });
        markersRef.current.push(userMarker);
      }
```

Place this right after the `gyms.forEach` loop body, before the bounds-fit / center logic. (If the marker-creation lives inside the map-init `.then(...)`, add it there after the loop.)

- [ ] **Step 3: Re-render markers when `gyms` or `userLocation` change**

The main effect's dependency array (around line 141) is `[apiKey, hasPlaceholderKey, t, userLocation]` — it excludes `gyms`, so filtered results don't update markers. Add `gyms` to the dependency array:

```ts
  }, [apiKey, hasPlaceholderKey, t, userLocation, gyms]);
```

This re-runs map init + marker rendering when the filtered `gyms` list changes. (Acceptable for the demo's data size; the existing cleanup already clears old markers via `markersRef.current.forEach(m => m.setMap(null))`.)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors. (If `getGymCoordinates` removal leaves an unused-var lint, ensure it's fully deleted.)

- [ ] **Step 5: Commit**

```bash
git add src/components/map/GoogleMap.tsx
git commit -m "fix(map): position markers at real coords, add user marker, re-render on filter"
```

---

## Task 8: Wire vicinity into fit/gyms

**Files:**
- Modify: `src/app/(main)/fit/gyms/page.tsx`

- [ ] **Step 1: Imports + hook**

Add imports:

```ts
import { useNearMe } from '@/hooks/useNearMe';
import { RadiusFilter } from '@/components/map/RadiusFilter';
import { annotateAndSortByDistance, filterByRadius } from '@/lib/geo';
```

Replace the existing `const [userLocation, setUserLocation] = useState(...)` and the `handleGetLocation` function with the hook:

```ts
  const { userLocation, radiusKm, isLocating, error, requestLocation, clearLocation, setRadiusKm } = useNearMe();
```

(Remove the old `userLocation` state + `handleGetLocation` definition. Keep passing `userLocation` to `<GoogleMap>`.)

- [ ] **Step 2: Render RadiusFilter**

In the controls area, replace the old standalone "use my location" button with:

```tsx
<RadiusFilter
  userLocation={userLocation}
  radiusKm={radiusKm}
  isLocating={isLocating}
  error={error}
  onRequestLocation={requestLocation}
  onClearLocation={clearLocation}
  onRadiusChange={setRadiusKm}
/>
```

- [ ] **Step 3: Apply distance to filteredGyms**

In the `filteredGyms` `useMemo`, after the text-search filtering produces `results`, branch on `userLocation`:

```ts
  const filteredGyms = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    let results = gyms.filter((gym) => {
      if (!normalizedQuery) return true;
      return (
        gym.name.toLowerCase().includes(normalizedQuery) ||
        gym.city.toLowerCase().includes(normalizedQuery)
      );
    });

    if (userLocation) {
      const annotated = annotateAndSortByDistance(results, userLocation, (g) =>
        typeof g.lat === 'number' && typeof g.lng === 'number' ? { lat: g.lat, lng: g.lng } : null
      );
      return radiusKm == null ? annotated : filterByRadius(annotated, radiusKm);
    }

    return [...results].sort((a, b) => b.rating - a.rating);
  }, [query, gyms, userLocation, radiusKm]);
```

(Remove the old `sort` variable usage if it's now unused; if the `sort` state/handleSort is still wired to a button, leave it but note it only applies in the non-location branch. Keep changes minimal — if `sort` becomes unused, remove its state + handler + button.)

- [ ] **Step 4: Show distance on cards**

In the gym card JSX, where city is shown, add a distance label when present. `filteredGyms` items now may carry `distanceKm`. Add:

```tsx
{'distanceKm' in gym && Number.isFinite((gym as { distanceKm?: number }).distanceKm) && (
  <span className="text-xs text-text-tertiary">
    {(gym as { distanceKm: number }).distanceKm.toFixed(1)} km
  </span>
)}
```

(Place near the city/rating row. The `in`/cast guard avoids a type error since the base `Venue` type has no `distanceKm`.)

- [ ] **Step 5: Type-check + manual**

Run: `npx tsc --noEmit` (zero errors).
Manual (dev server): `/fit/gyms` → tap "Vicino a me" → grant location → cards show "X.X km", sorted nearest, radius chips filter; map shows your marker + venue markers.

- [ ] **Step 6: Commit**

```bash
git add 'src/app/(main)/fit/gyms/page.tsx'
git commit -m "feat(fit): vicinity filtering on gyms — near-me, radius, distance labels"
```

---

## Task 9: Wire vicinity into booking

**Files:**
- Modify: `src/app/(main)/booking/page.tsx`

- [ ] **Step 1: Imports + hook**

```ts
import { useNearMe } from '@/hooks/useNearMe';
import { RadiusFilter } from '@/components/map/RadiusFilter';
import { annotateAndSortByDistance, filterByRadius } from '@/lib/geo';
```

In the component body:

```ts
  const { userLocation, radiusKm, isLocating, error, requestLocation, clearLocation, setRadiusKm } = useNearMe();
```

- [ ] **Step 2: Render RadiusFilter below the category row**

After the category chips block (inside the sticky/header area), add:

```tsx
<div className="px-4 pb-3">
  <RadiusFilter
    userLocation={userLocation}
    radiusKm={radiusKm}
    isLocating={isLocating}
    error={error}
    onRequestLocation={requestLocation}
    onClearLocation={clearLocation}
    onRadiusChange={setRadiusKm}
  />
</div>
```

- [ ] **Step 3: Derive displayed providers with distance**

Add a `useMemo` after `searchResults` is available:

```ts
  const displayedProviders = useMemo(() => {
    if (!userLocation) return searchResults;
    const annotated = annotateAndSortByDistance(searchResults, userLocation, (p) =>
      p.location ? { lat: p.location.lat, lng: p.location.lng } : null
    );
    return radiusKm == null ? annotated : filterByRadius(annotated, radiusKm);
  }, [searchResults, userLocation, radiusKm]);
```

Then replace the list/map render's `searchResults.map(...)` with `displayedProviders.map(...)` (both the list cards AND the map's `gyms={...}` mapping). Update the empty-state check to use `displayedProviders.length`.

- [ ] **Step 4: Show distance on provider cards**

In the provider card's availability row, add when present:

```tsx
{'distanceKm' in provider && Number.isFinite((provider as { distanceKm?: number }).distanceKm) && (
  <span className="text-xs text-text-tertiary">
    {(provider as { distanceKm: number }).distanceKm.toFixed(1)} km
  </span>
)}
```

- [ ] **Step 5: Type-check + manual**

Run: `npx tsc --noEmit` (zero errors).
Manual: `/booking` → "Vicino a me" → grant → distance labels, nearest sort, radius filter; map shows providers at real coords + user marker.

- [ ] **Step 6: Commit**

```bash
git add 'src/app/(main)/booking/page.tsx'
git commit -m "feat(booking): vicinity filtering on trainer search — near-me, radius, distance labels"
```

---

## Task 10: Final verification

- [ ] **Step 1: Unit tests**

Run: `npm test -- --run 2>&1 | tail -20`
Expected: new `geo.test.ts` (5) + `useNearMe.test.ts` (4) pass. Pre-existing failures (home page, functions emulator, auth register) unchanged — list them, don't treat as blockers.

- [ ] **Step 2: tsc + build**

Run: `npx tsc --noEmit && npm run build 2>&1 | tail -8`
Expected: zero TS errors; static export succeeds.

- [ ] **Step 3: Manual end-to-end (dev server)**

1. `/fit/gyms` list view → "Vicino a me" → grant location (browser may prompt; in Playwright use a mocked geolocation or accept) → cards show "X.X km", nearest-first; switch radius chips → list shrinks/grows; map view → venue markers at real positions + blue "you are here" marker.
2. `/booking` → same flow with trainers.
3. Deny location once → "Posizione non disponibile", list still works (no distances).

- [ ] **Step 4: Note map key status**

If the Google Maps tile shows the "request rejected"/"load failed" message (missing/invalid API key), record it — the list vicinity filtering still demos fully. Not a blocker for this plan.

- [ ] **Step 5: No commit unless a fix was needed.**

---

## Self-Review Notes

**Spec coverage:** geo helpers → T1; useNearMe → T2; RadiusFilter → T3; provider coords type/accessor → T4; searchProviders location + dead-code removal → T5; coord seed (+ lift DEMO_CITIES) → T6; GoogleMap real coords/user marker/re-render → T7; fit/gyms wiring → T8; booking wiring → T9; verification → T10. All spec sections covered.

**Placeholder scan:** None. (An earlier draft of Task 6 had a typo'd `jLng` line; corrected inline.)

**Type consistency:** `LatLng` from geo.ts used by useNearMe, RadiusFilter, both pages. `RadiusKm` (`5|10|25|50|null`) consistent across useNearMe + RadiusFilter. `distanceKm` (not `distance`) is the field added by `annotateAndSortByDistance` and read in both pages' cards. `searchProviders` populates `location:{lat,lng,address}` matching the existing `ProviderSearchResult.location` shape. Provider `lat/lng` optional-number consistent in type + accessor + seed.

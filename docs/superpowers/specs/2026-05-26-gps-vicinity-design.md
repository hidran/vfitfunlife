# GPS Positioning + Vicinity Filtering

**Date:** 2026-05-26
**Branch:** `main`
**Status:** Design approved, ready for implementation plan

## Problem

The map and "near me" affordances are non-functional:

1. **Providers (instructors) have no coordinates.** `searchProviders` reads `p.location?.lat`, but `location` is never populated, so trainer map markers never render and distance can't be computed.
2. **The `GoogleMap` component ignores real coordinates.** It positions every marker with a mock generator `getGymCoordinates(id, index)` using `Math.sin/cos(index) + Math.random()` around Milan — fake, non-deterministic positions. Even venues (which DO have real `lat`/`lng`) are mis-placed.
3. **Vicinity filtering isn't wired.** `fit/gyms` has a "use my location" button and `nearest` sort option, but the sort falls back to rating. `firebookings.ts` has a `calculateDistance` Haversine helper that's gated on a `location` that's never set.

## Goals

- Every venue AND provider has usable `lat`/`lng`.
- The map positions markers at their real coordinates (deterministic, correct).
- Users can tap "Near me", grant geolocation, and: see distance on each card, sort nearest-first, and filter to a radius (5/10/25/50 km).
- Works on both `fit/gyms` (venues) and `booking` (providers).
- The list-based vicinity filter works even if the Google Maps tile can't render (missing API key) — map and filter are decoupled.

## Non-goals

- Reverse-geocoding the user's coordinates to a city/address name.
- Map-viewport-bounds filtering (radius filtering was chosen instead).
- Trainer→venue co-location (provider coords are city-derived, not venue-anchored).
- Real-time location tracking (`watchPosition`); a one-shot `getCurrentPosition` is enough.
- Changing venue coordinates (they're already correct from the venue seed).

## Architecture

### Coordinate data

| Entity | Source of lat/lng |
|---|---|
| Venues | Already seeded (city center + jitter). No change. |
| Providers (instructors) | **New** — derived from the instructor's `city` field via the seeder's `DEMO_CITIES` coord table + deterministic jitter (±0.02°). |

### Shared geo utilities — `src/lib/geo.ts` (new)

Pure functions, no React, no Firebase:

```ts
export interface LatLng { lat: number; lng: number; }

/** Great-circle distance in kilometers (Haversine). */
export function haversineKm(a: LatLng, b: LatLng): number;

/**
 * Annotate each item with `distanceKm` (relative to `from`) and return a new
 * array sorted nearest-first. Items missing coordinates get distanceKm =
 * Infinity and sort last. `getCoords` extracts a LatLng (or null) per item.
 */
export function annotateAndSortByDistance<T>(
  items: T[],
  from: LatLng,
  getCoords: (item: T) => LatLng | null
): (T & { distanceKm: number })[];

/** Keep only items within `radiusKm`. Items with distanceKm === Infinity are dropped. */
export function filterByRadius<T extends { distanceKm: number }>(
  items: T[],
  radiusKm: number
): T[];
```

The existing private `calculateDistance` in `firebookings.ts` is removed entirely (its only caller, the in-function distance sort in `searchProviders`, is also removed — distance now lives page-side via `geo.ts`). Confirmed no other reader of `ProviderSearchResult.distance` exists outside `searchProviders` itself.

### Near-me hook — `src/hooks/useNearMe.ts` (new)

```ts
export type RadiusKm = 5 | 10 | 25 | 50 | null; // null = "Tutti" (no radius cap)

export interface UseNearMe {
  userLocation: LatLng | null;
  radiusKm: RadiusKm;
  isLocating: boolean;
  error: string | null;
  requestLocation: () => void;   // calls navigator.geolocation.getCurrentPosition
  clearLocation: () => void;     // turns vicinity mode off
  setRadiusKm: (r: RadiusKm) => void;
}

export function useNearMe(): UseNearMe;
```

- `requestLocation` sets `isLocating`, calls `getCurrentPosition`, stores `{lat,lng}` on success, sets `error` on failure (denied/unavailable/timeout) and leaves `userLocation` null.
- Default `radiusKm` = `25`.

### Radius filter UI — `src/components/map/RadiusFilter.tsx` (new)

Props: `{ userLocation, radiusKm, isLocating, error, onRequestLocation, onClearLocation, onRadiusChange }`.

Renders:
- When no `userLocation`: a "📍 Vicino a me" button (disabled+spinner while `isLocating`). If `error`, a small muted line "Posizione non disponibile" beneath.
- When `userLocation` set: a row of radius chips `5 · 10 · 25 · 50 km · Tutti` (active one highlighted) + a small "✕ Disattiva" to clear.

Self-contained; both pages render it identically.

### GoogleMap fix — `src/components/map/GoogleMap.tsx`

- Remove the `getGymCoordinates(id, index)` mock generator usage.
- For each `gym`, place the marker at `gym.lat`/`gym.lng`. If both are missing/NaN, skip that marker (don't invent a position).
- Centering/zoom:
  - If `userLocation` provided → center on it, zoom 12, and render a distinct "you are here" marker (different color/icon).
  - Else → fit bounds (`google.maps.LatLngBounds`) to all valid markers; if only one, center it at zoom 13.
- Keep the existing `onGymSelect` behavior and marker info windows.

### fit/gyms page (`src/app/(main)/fit/gyms/page.tsx`)

- Replace the inline `userLocation`/`handleGetLocation` with `useNearMe`.
- Render `<RadiusFilter>` in the controls row (near the existing sort/location buttons; remove the now-redundant standalone location button).
- In `filteredGyms` (the existing `useMemo`): when `userLocation` is set, run `annotateAndSortByDistance(gyms, userLocation, g => ({lat:g.lat,lng:g.lng}))` then `filterByRadius(..., radiusKm)` when radius ≠ null. When no location, keep the current text-search + rating sort.
- On each gym card, show `gym.distanceKm` as "X.X km" when present.
- Pass `userLocation` to `<GoogleMap>` (already wired).

### booking page (`src/app/(main)/booking/page.tsx`)

Uses the SAME `geo.ts` path as fit/gyms (symmetric — distance/sort/filter is page-side, not inside `searchProviders`):

- Add `useNearMe` + render `<RadiusFilter>` below the category row.
- `searchProviders` runs as today (no location param needed). The results carry `location: {lat,lng}` (see below).
- Derive the displayed list with a `useMemo`: when `userLocation` is set, `annotateAndSortByDistance(searchResults, userLocation, p => p.location ?? null)` then `filterByRadius(..., radiusKm)` when radius ≠ null. When no location, render `searchResults` as-is.
- Show `provider.distanceKm` as "X.X km" on each card next to the availability line.
- Map view: providers now have real coords via `searchProviders` populating `location`.

### searchProviders changes (`src/lib/firebookings.ts`)

- Populate `location` on each result from the instructor doc:
  `location: (typeof data.lat === 'number' && typeof data.lng === 'number') ? { lat: data.lat, lng: data.lng, address: data.city ?? '' } : undefined`.
- **Remove** the in-function distance computation + `sortBy:'distance'` branch and the private `calculateDistance` helper. Distance/sort/filter now lives entirely in the page via `geo.ts`, so both pages share one code path and there's no `distance` vs `distanceKm` field split. `searchProviders` just returns providers (with `location`); it no longer takes/uses `params.location`.
- The `ProviderSearchResult.distance` field is no longer set by the accessor; the page adds `distanceKm` via `annotateAndSortByDistance`. (Leave the optional `distance` field on the type or remove if unused — verify no other reader.)

### Seed — `functions/src/seed/seedData.ts`

`generateDemoProviderCoords()` (new, mirrors `generateDemoAvatars`/`generateDemoProviderPrices`):

- Reuse the `DEMO_CITIES` table (name → {lat, lng}) already defined for venue seeding. (If it's scoped inside `generateDemoData`, lift a module-level `DEMO_CITY_COORDS` constant so both can share it.)
- For each instructor doc: read its `city`, look up base coords (default Milano if unknown), add deterministic jitter from an ID hash (±0.02°, same formula as venues), write `{ lat, lng }` via merge.
- Batched ≤400 ops. Idempotent.

A local-run script `functions/scripts/run-seed-coords.mjs` mirrors the existing seed scripts.

## Data flow (vicinity, booking example)

```
User taps "Vicino a me"
  → useNearMe.requestLocation()
  → navigator.geolocation.getCurrentPosition
  → userLocation = {lat,lng}
  → searchProviders already returned providers carrying location {lat,lng,address:city}
  → page useMemo: annotateAndSortByDistance(searchResults, userLocation, p => p.location)
       → each provider gets distanceKm; array sorted nearest-first
     → filterByRadius(annotated, radiusKm)   [skipped when radius = Tutti]
  → render cards with "X.X km"; map centers on user, markers at provider coords
```

(`fit/gyms` is identical with `getCoords = g => ({lat:g.lat, lng:g.lng})`.)

## Error handling

| Failure | Behavior |
|---|---|
| Geolocation permission denied / unavailable / timeout | `useNearMe.error` set; `userLocation` stays null; `RadiusFilter` shows "Posizione non disponibile"; lists fall back to default (no distance, no radius filter). No crash. |
| Item missing lat/lng | Excluded from radius results (distanceKm = Infinity → dropped by `filterByRadius`); shown normally when vicinity mode is off; skipped as a map marker. |
| Google Maps JS API key missing | Map tile fails to render (component's own concern), but list vicinity filter + distance labels work independently. Flagged as a risk to verify at implementation. |
| `searchProviders` returns providers without `location` (legacy docs not re-seeded) | They get no distance and sort last; radius filter drops them. Acceptable; the seed covers all demo docs. |

## Testing

- Unit (vitest) for `src/lib/geo.ts`:
  - `haversineKm` — known city-pair distance within tolerance (e.g. Milano↔Roma ≈ 477 km ± 5).
  - `annotateAndSortByDistance` — nearest-first ordering; missing-coords items sort last with Infinity.
  - `filterByRadius` — keeps in-radius, drops out-of-radius and Infinity.
- Unit for `useNearMe` — mock `navigator.geolocation`; success sets userLocation, denial sets error.
- No automated test for the live Google Maps render (needs API + DOM); manual verification.

## Implementation ordering (detailed in writing-plans)

0. `src/lib/geo.ts` + vitest tests.
1. `useNearMe` hook + test.
2. `RadiusFilter` component.
3. Types: `Provider.lat/lng`; `flattenProvider` mapping.
4. Seed: lift `DEMO_CITY_COORDS`, add `generateDemoProviderCoords`, run it.
5. `searchProviders`: populate `location`, swap to `haversineKm`.
6. `GoogleMap`: use real coords + user marker + bounds/center.
7. `fit/gyms`: useNearMe + RadiusFilter + distance annotate/filter/labels.
8. `booking`: useNearMe + RadiusFilter + location→searchFilters + distance labels.
9. Verify: tests, build, manual (both pages, list + map, with a mocked/real location).

## Risks

| Risk | Mitigation |
|---|---|
| Google Maps API key not configured → map blank | List vicinity works independently; verify key in step 6 and flag if blank. Demo can show list filtering regardless. |
| `getCurrentPosition` needs HTTPS/localhost + user permission; may be denied in demo | Graceful fallback (no crash, lists work without distance). For demo, can hard-set a Milano coordinate fallback if permission is denied (decision deferred; default is graceful-off). |
| `DEMO_CITIES` may be function-scoped in the seeder | Step 4 lifts it to a shared module constant; low risk, localized. |
| Provider coord seed is a 4th pass over 321 docs (~slow, like the price seed at 75s) | Batched writes; acceptable one-time cost. Reads only the doc (city), not subcollections, so faster than the price seed. |
| Two pages duplicating filter logic | Centralized in `geo.ts` + `useNearMe` + `RadiusFilter`; pages only wire props. |

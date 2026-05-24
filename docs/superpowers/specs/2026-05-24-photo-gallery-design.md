# Photo Gallery for Venues + Trainers

**Date:** 2026-05-24
**Branch:** `cycle/c1-personal-profile`
**Status:** Design approved, ready for implementation plan

## Problem

Demo trainers and venues currently render with no photos — placeholder "?" avatars and bare gradient blocks for venue heroes. The app needs to (a) let trainers and venue admins upload their own gallery photos, (b) show those photos to customers as a swipeable gallery on detail pages and as a cover image on list cards.

## Goals

- Trainers can add and remove photos from their gallery via `/provider/services`.
- Venue admins can add and remove photos from `/admin/venues`.
- Customers see a horizontal-scroll photo gallery on venue and provider detail pages, plus cover images on list cards.
- Demo trainers and venues come pre-seeded with stock photos so the demo is visually complete out of the box.
- Upload uses native camera + photo library on Capacitor mobile builds; falls back to file input on web.

## Non-goals

- Drag-to-reorder UI. Cover is `photoUrls[0]`; reordering can be a follow-up.
- Captions per photo.
- Video upload.
- Cloud Function–mediated uploads. The existing `storage.rules` comment ("Managed by Cloud Functions") is aspirational; direct client uploads with rule enforcement match the avatar pattern, ship faster, and are good enough for this scope.
- Cover image cropping UI. `browser-image-compression` preserves aspect ratio.
- HEIC → JPG conversion. Capacitor camera already returns JPEG on iOS by default.
- Pinch-to-zoom in the lightbox. Tap-to-close + horizontal swipe between photos only.

## Architecture

### Storage layout

| Path | Used for |
|---|---|
| `venues/{venueId}/gallery/{ts}-{rand}.jpg` | Venue gallery photos |
| `instructors/{instructorId}/gallery/{ts}-{rand}.jpg` | Trainer gallery photos |
| `users/{userId}/avatar/{filename}` | Pre-existing — not touched |

Photos are publicly readable (matches existing rules). Writes are gated to the entity owner or admin (see Storage rules section).

### Firestore schema additions

```ts
// src/types/venue.ts
export interface Venue {
  // ...existing fields...
  photoUrls?: string[]; // max 10. photoUrls[0] is the cover.
}

// src/types/instructor.ts
export interface Provider {
  // ...existing fields...
  photoUrls?: string[]; // max 10. photoUrls[0] is the cover.
}
```

`docs/database-schema.md` already lists `images: string[]` and `coverImage: string | null` on the venue + instructor schema. We are NOT using those documented fields — the single `photoUrls` array with implicit cover at index 0 is simpler, less state-sync, and matches what mobile-first competitors do. The doc fields are unused; we'll flag this in the spec changelog so it can be aligned in a follow-up doc edit.

### Storage rules update

`storage.rules` is a separate ruleset from `firestore.rules` and cannot directly call the Firestore-rules helpers like `isVenueStaff()`. It CAN do Firestore cross-product reads via `firestore.exists(...)`/`firestore.get(...)`, but each call counts as a Firestore read on every Storage write. For the demo we keep this simple: venue gallery writes require admin; trainer gallery writes require ownership (uid == instructorId). Venue staff write access can be added in a follow-up via a Firestore-emitted custom claim or a cross-product `firestore.exists()` check.

Add a helper for admin check inside `storage.rules` (mirroring the Firestore rules' `isAdmin()`):

```
function isAdminStorage() {
  return isAuthenticated() &&
    firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role in ['admin', 'superadmin'];
}
```

Then the gallery rules:

```
match /venues/{venueId}/gallery/{fileName} {
  allow read: if true;
  allow create, update: if isValidImage() && isAdminStorage();
  allow delete: if isAdminStorage();
}

match /instructors/{instructorId}/gallery/{fileName} {
  allow read: if true;
  allow create, update: if isValidImage() && (isAdminStorage() || isOwner(instructorId));
  allow delete: if isAdminStorage() || isOwner(instructorId);
}
```

The existing catch-all `/venues/{venueId}/{allPaths=**}` and `/instructors/{instructorId}/{allPaths=**}` rules stay in place to deny everything OTHER than the gallery subpath. Order matters: the more specific `/gallery/{fileName}` rule must precede the catch-all (Firebase Storage uses most-specific-match semantics).

### Firestore rules

No new collection paths — `photoUrls` is just a field on existing `/venues/{id}` and `/instructors/{id}` documents. Writes to those docs are already gated:
- `/venues/{venueId}` writable by admin or venue staff (existing rule)
- `/instructors/{instructorId}` writable by admin or owner (existing rule)

So `updateVenuePhotos(id, urls)` and `updateProviderPhotos(id, urls)` use the existing rule surface.

### Components

| File | Responsibility |
|---|---|
| `src/components/gallery/PhotoGallery.tsx` | Horizontal-scroll carousel. Renders one `<img>` per URL with `loading="lazy"`, CSS scroll-snap, tap opens `PhotoLightbox`. Empty state: renders nothing (parent decides fallback). |
| `src/components/gallery/PhotoLightbox.tsx` | Fullscreen modal. Tracks active index; left/right swipe via touch events; close button + tap-outside dismisses. No pinch-to-zoom. |
| `src/components/gallery/PhotoUploader.tsx` | Multi-photo manager. Shows current photos as thumbnails with `X` delete badge, plus an "Add photo" tile that opens Capacitor camera/library picker (with web file-input fallback). Enforces max 10 client-side. Calls onChange with the new full array each mutation. |
| `src/components/gallery/PhotoCover.tsx` | Single cover image for list cards. Props: `src` (first photo) + `fallback` (e.g. a gradient div) + `alt`. |
| `src/components/gallery/PhotoEditorOverlay.tsx` | Fixed-position backdrop + centered card wrapping `<PhotoUploader>` for the admin venue flow. Locks body scroll while open. |

### Data layer

| File | Adds |
|---|---|
| `src/lib/firebase/storage.ts` | `uploadGalleryPhoto({ scope, entityId, file })` — compress + upload + return URL. `deleteGalleryPhoto(url)` — parse storage path from URL, delete. |
| `src/lib/firebase/venues.ts` | `updateVenuePhotos(venueId: string, photoUrls: string[])` — `updateDoc` on `/venues/{id}`. |
| `src/lib/firebase/providers.ts` | `updateProviderPhotos(providerId: string, photoUrls: string[])` — `updateDoc` on `/instructors/{id}`. |
| `src/hooks/usePhotoUpload.ts` | `useUpdateVenuePhotos()`, `useUpdateProviderPhotos()` — TanStack `useMutation` wrappers that invalidate the matching `useVenue`/`useProvider` query on success. |

### Capture flow (PhotoUploader)

```
User taps "Add photo" tile
  ↓
Capacitor.isNativePlatform()?
  ├─ true:  Camera.getPhoto({ source: PROMPT, resultType: DataUrl, quality: 80 })
  │         → user picks Camera or Photo Library natively
  │         → returns base64 dataUrl
  │         → convert to Blob → File
  └─ false: <input type="file" accept="image/*"> click()
            → File from change event
  ↓
imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1200, useWebWorker: true })
  ↓
uploadBytes(ref(`venues|instructors/{id}/gallery/{ts}-{rand}.jpg`), compressed)
  ↓
getDownloadURL → push into local state
  ↓
useUpdateXxxPhotos.mutate(newArray)
  ↓
Firestore /venues/{id} or /instructors/{id} doc updated
  ↓
TanStack Query invalidates → consumers refetch
```

### Demo seed extension

`functions/src/seed/seedData.ts` — add `generateDemoPhotos()` that populates `photoUrls` on existing demo docs. Idempotent (`set({ photoUrls: [...] }, { merge: true })`). Photo URLs are curated `images.unsplash.com` direct links (no auth needed, stable):

```ts
// Pools — picked from Unsplash for relevance, no copyright concerns
const GYM_PHOTOS = [
  'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800',
  'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=800',
  // ...6 total
];
const TRAINER_PHOTOS = [
  'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800',
  // ...8 total
];
const WELLNESS_PHOTOS = [...];   // spa, wellness-center
const BEAUTY_PHOTOS = [...];     // beauty salons
```

Per-venue: 4-6 photos randomized from the type-matching pool (gym → GYM_PHOTOS, beauty_salon → BEAUTY_PHOTOS, etc.). Per-trainer: 3-5 photos from TRAINER_PHOTOS. Same RNG seed strategy as existing seeders (deterministic per entity ID hash so re-running the seed produces stable assignments).

Estimated writes: 120 venues + 320 instructors = 440 doc updates. Well under the batch limit.

### Customer-side display

| Page | Change |
|---|---|
| `/venue?id=X` (VenueDetailClient) | Replace the existing `heroGradients` carousel with `<PhotoGallery photos={venue.photoUrls ?? []} />`. If `photoUrls` is empty, fall back to the current gradient hero (existing render path). |
| `/book?providerId=X` (BookingClient) | New section above the Services/Reviews/About tabs: `{provider.photoUrls?.length ? <PhotoGallery photos={provider.photoUrls} /> : null}`. |
| `/fit/gyms` | Each gym card uses `<PhotoCover src={gym.photoUrls?.[0]} fallback={<GradientBlock variant={index % 2} />} alt={gym.name} />` in place of the current bare gradient block. |
| `/booking` (provider search) | Same `PhotoCover` pattern on each provider card. |

### Upload UX placement

**Trainer flow — new Gallery tab on `/provider/services`:**

The existing services page gets a tab bar at the top:

```
[ Servizi ] [ Galleria ]
```

When `Galleria` is active, render the `<PhotoUploader photos={...} onChange={...} />` strip + the existing thumbnails. The trainer's `instructorId` comes from `useAuthStore.firebaseUser.uid`. The current photo list is read via `useProviderServices(uid)`... actually no — it's `useProvider(uid).data?.photoUrls`. Use the existing `useProvider` hook.

**Venue admin flow — row action on `/admin/venues`:**

Add a "Foto" button column on the admin venues table. Click opens an overlay. No `<Dialog>` primitive exists in `src/components/ui/` today, so the spec uses a self-contained `<PhotoEditorOverlay>` wrapper component built ad-hoc: a fixed-position backdrop + centered card with `<PhotoUploader>` inside and a close button. CSS pattern: `fixed inset-0 z-50 bg-black/60 flex items-center justify-center` with body scroll locked while open (set/restore `document.body.style.overflow` in a `useEffect`). The overlay component lives at `src/components/gallery/PhotoEditorOverlay.tsx` so it can be reused later for trainer-side modal flows if needed.

## Error handling

| Failure | Behavior |
|---|---|
| Capacitor camera permission denied | Toast: "Concedi l'accesso alla fotocamera nelle impostazioni." Stay on uploader, no state change. |
| Compression throws (e.g. corrupt file) | Toast: "Immagine non valida." File skipped. |
| Storage upload rejected (rules / network) | Toast with error message. Photo not added to array. |
| Firestore update fails after Storage upload succeeded | The uploaded blob is orphaned in Storage — not a fatal demo issue. Log + toast. A follow-up could add a cleanup pass on next successful save. |
| `useProvider`/`useVenue` returns stale `photoUrls` after a save | TanStack Query is invalidated on mutation success, so the next read reflects the new list. |

## Testing

- Vitest unit tests for `uploadGalleryPhoto` — mock `firebase/storage` and `browser-image-compression`, assert ref path + compression options.
- Vitest unit test for `PhotoGallery` rendering — verify empty state renders nothing; non-empty renders one `<img>` per URL.
- Vitest unit test for `PhotoUploader` — verify max 10 enforcement, delete removes from array.
- No e2e for the camera flow (requires real device permissions); deferred.

## Migration ordering (high-level — detailed in writing-plans)

0. Storage rules: add gallery write rules, deploy.
1. Types: add `photoUrls` to Venue + Provider.
2. Storage helper: `uploadGalleryPhoto` + `deleteGalleryPhoto`.
3. Firestore write helpers + hooks: `updateVenuePhotos`, `updateProviderPhotos`, `useUpdateVenuePhotos`, `useUpdateProviderPhotos`.
4. `PhotoGallery` + `PhotoLightbox` + `PhotoCover` components.
5. `PhotoUploader` component.
6. Seed extension: `generateDemoPhotos` writing curated Unsplash URLs.
7. Run seed locally → demo data has photos.
8. Wire `PhotoGallery` into venue detail + book detail.
9. Wire `PhotoCover` into fit/gyms + booking search cards.
10. Add Gallery tab to `/provider/services`.
11. Add Foto modal to `/admin/venues`.
12. Final verification (manual + the new vitest tests).

## Risks

| Risk | Mitigation |
|---|---|
| Capacitor camera permission UX on web → no native picker means file input UX feels less premium for a mobile demo | Falls back to `<input type="file">` cleanly. Test in both modes during step 5. |
| Unsplash URLs expire or rate-limit | Curated `images.unsplash.com/photo-*?w=800` direct links are stable for years. If they ever break, swap pools in the seed function. |
| Lightbox state on iOS Safari (scroll lock) | Use `document.body.style.overflow = 'hidden'` while open + restore on close. Standard pattern. |
| `photoUrls[0]` re-promotion needs cover swap | Out of scope: tap-to-promote in a follow-up. For now, the first uploaded photo is the cover. |
| Storage uploads in demo env consume bandwidth | Demo seeded photos are Unsplash URLs — no Storage writes for the seeded data. Only real uploads from the demo show flow hit Storage. Fine. |
| Existing `storage.rules` order — catch-all `/venues/{id}/{allPaths=**}` rule still has `allow write: if false` | The new `/gallery/{fileName}` rule must be more specific and placed BEFORE the catch-all, OR the catch-all must be edited to exclude the gallery path. Step 0 of the plan resolves this explicitly. |

## Open questions resolved during brainstorming

- **Single `photoUrls` array vs documented `coverImage + images[]`?** → Single array, index 0 is cover. Less sync surface; matches user-facing convention.
- **Capacitor camera or file input only?** → Both, with `Capacitor.isNativePlatform()` switch.
- **Where does the trainer manage photos?** → New "Galleria" tab on `/provider/services`.
- **Where does the venue admin manage photos?** → Row action modal on `/admin/venues`.
- **Cloud Functions vs direct upload?** → Direct upload, matches existing avatar pattern.
- **Pinch-to-zoom in lightbox?** → No, out of scope.
- **Reorder UI?** → No, out of scope.

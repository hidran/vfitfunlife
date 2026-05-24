# Photo Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a photo gallery feature where trainers and venue admins upload photos that customers see on detail pages (horizontal-scroll carousel + lightbox) and as cover images on list cards.

**Architecture:** Single ordered `photoUrls: string[]` array on Venue + Provider Firestore docs (index 0 = cover). Direct client uploads to Firebase Storage at `venues/{id}/gallery/...` and `instructors/{id}/gallery/...` paths, with storage rules gated by admin/owner via Firestore cross-product. Display via reusable `PhotoGallery` / `PhotoLightbox` / `PhotoCover` components. Capacitor camera on native, file input on web. Demo seeded with curated Unsplash URLs.

**Tech Stack:** Next.js 16 (static export) · React 19 · TanStack Query v5 · Firebase Storage v12 · @capacitor/camera v8 · browser-image-compression · Vitest

**Spec:** `docs/superpowers/specs/2026-05-24-photo-gallery-design.md`

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `src/components/gallery/PhotoGallery.tsx` | Horizontal scroll carousel rendering one img per URL; opens PhotoLightbox on tap |
| `src/components/gallery/PhotoLightbox.tsx` | Fullscreen modal viewer with prev/next + close; body scroll lock while open |
| `src/components/gallery/PhotoCover.tsx` | Single cover image with gradient fallback for list cards |
| `src/components/gallery/PhotoUploader.tsx` | Multi-photo manager: thumbnails + delete + Add tile (Capacitor camera or file input) |
| `src/components/gallery/PhotoEditorOverlay.tsx` | Fixed backdrop + centered card wrapping PhotoUploader for admin venue flow |
| `src/lib/firebase/photos.ts` | Storage upload/delete helpers (`uploadGalleryPhoto`, `deleteGalleryPhoto`) |
| `src/lib/firebase/photos.test.ts` | Vitest unit tests for upload helper |
| `src/hooks/usePhotoUpload.ts` | TanStack mutation hooks (`useUpdateVenuePhotos`, `useUpdateProviderPhotos`) |

### Modified

| Path | Change |
|---|---|
| `storage.rules` | Add gallery write rules with Firestore cross-product admin check |
| `src/types/venue.ts` | Add `photoUrls?: string[]` to Venue interface |
| `src/types/instructor.ts` | Add `photoUrls?: string[]` to Provider interface |
| `src/lib/firebase/venues.ts` | Add `updateVenuePhotos(id, urls)` write helper |
| `src/lib/firebase/providers.ts` | Add `updateProviderPhotos(id, urls)` write helper |
| `src/app/(main)/venue/VenueDetailClient.tsx` | Render PhotoGallery when photoUrls present; else keep existing gradient hero |
| `src/app/book/BookingClient.tsx` | Add PhotoGallery section above tabs |
| `src/app/(main)/fit/gyms/page.tsx` | Replace gradient hero block on cards with PhotoCover |
| `src/app/booking/page.tsx` | Add PhotoCover to provider cards (replace avatar placeholder) |
| `src/app/(main)/provider/services/page.tsx` | Add Galleria tab; render PhotoUploader |
| `src/app/admin/venues/page.tsx` | Add Foto button per row; opens PhotoEditorOverlay |
| `src/hooks/index.ts` | Re-export new photo hooks |
| `functions/src/seed/seedData.ts` | Add `generateDemoPhotos` writing curated Unsplash URLs to existing demo docs |

### No-touch

- `firestore.rules` — `photoUrls` is just a field on existing docs; the existing venue/instructor write rules cover it.
- Existing avatar paths in `storage.rules` — unchanged.

---

## Task 1: Storage rules — gallery write paths

**Files:**
- Modify: `storage.rules`

- [ ] **Step 1: Add admin helper at the top of storage.rules service block**

After the existing `isOwner(userId)` helper (around line 13), add:

```
    function isAdminStorage() {
      return isAuthenticated() &&
        firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role in ['admin', 'superadmin'];
    }
```

- [ ] **Step 2: Add the two gallery rules BEFORE the existing catch-all `/venues/{venueId}/{allPaths=**}` and `/instructors/{instructorId}/{allPaths=**}` rules**

Locate the existing block (around lines 30-45 of storage.rules):

```
    match /venues/{venueId}/{allPaths=**} {
      allow read: if true;
      allow write: if false; // Managed by Cloud Functions
    }
    match /instructors/{instructorId}/{allPaths=**} {
      allow read: if true;
      allow write: if false; // Managed by Cloud Functions
    }
```

Insert these BEFORE each catch-all (more specific match wins):

```
    match /venues/{venueId}/gallery/{fileName} {
      allow read: if true;
      allow create, update: if isValidImage() && isAdminStorage();
      allow delete: if isAdminStorage();
    }
    match /venues/{venueId}/{allPaths=**} {
      allow read: if true;
      allow write: if false; // Managed by Cloud Functions
    }

    match /instructors/{instructorId}/gallery/{fileName} {
      allow read: if true;
      allow create, update: if isValidImage() && (isAdminStorage() || isOwner(instructorId));
      allow delete: if isAdminStorage() || isOwner(instructorId);
    }
    match /instructors/{instructorId}/{allPaths=**} {
      allow read: if true;
      allow write: if false; // Managed by Cloud Functions
    }
```

- [ ] **Step 3: Deploy storage rules**

Run: `npx firebase deploy --only storage --project vfit-funlife 2>&1 | tail -10`
Expected: `✔ storage: released rules ... to firebase.storage` and `✔ Deploy complete!`

- [ ] **Step 4: Commit**

```bash
git add storage.rules
git commit -m "$(cat <<'EOF'
feat(rules): allow direct gallery uploads to /venues/{id}/gallery and /instructors/{id}/gallery

Adds storage rules for the photo gallery feature. Venue gallery writes
require admin (via Firestore cross-product); instructor gallery writes
require admin or owner (uid == instructorId). The pre-existing catch-all
rules at /venues/{id}/** and /instructors/{id}/** stay denied for all
other subpaths.
EOF
)"
```

---

## Task 2: Types — add photoUrls field

**Files:**
- Modify: `src/types/venue.ts`
- Modify: `src/types/instructor.ts`

- [ ] **Step 1: Add field to Venue**

In `src/types/venue.ts`, find the `Venue` interface and add after `hours: VenueHours[];`:

```ts
  photoUrls?: string[]; // max 10. photoUrls[0] is the cover.
```

- [ ] **Step 2: Add field to Provider**

In `src/types/instructor.ts`, find the `Provider` interface and add after `languages: string[];`:

```ts
  photoUrls?: string[]; // max 10. photoUrls[0] is the cover.
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/venue.ts src/types/instructor.ts
git commit -m "feat(types): add photoUrls array to Venue and Provider"
```

---

## Task 3: Storage helpers — uploadGalleryPhoto + deleteGalleryPhoto (TDD)

**Files:**
- Create: `src/lib/firebase/photos.ts`
- Create: `src/lib/firebase/photos.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/firebase/photos.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadGalleryPhoto, deleteGalleryPhoto } from './photos';

vi.mock('firebase/storage', () => ({
  ref: vi.fn((_storage, path: string) => ({ fullPath: path })),
  uploadBytes: vi.fn().mockResolvedValue({ ref: { fullPath: 'mock' } }),
  getDownloadURL: vi.fn().mockResolvedValue('https://storage.example/photo.jpg'),
  deleteObject: vi.fn().mockResolvedValue(undefined),
  getStorage: vi.fn(() => ({})),
}));

vi.mock('browser-image-compression', () => ({
  default: vi.fn((file: File) => Promise.resolve(file)),
}));

import { ref, uploadBytes, deleteObject, getStorage } from 'firebase/storage';
import imageCompression from 'browser-image-compression';

const mockRef = vi.mocked(ref);
const mockUploadBytes = vi.mocked(uploadBytes);
const mockDeleteObject = vi.mocked(deleteObject);
const mockCompression = vi.mocked(imageCompression);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('uploadGalleryPhoto', () => {
  it('uploads to venues/{id}/gallery for venue scope', async () => {
    const file = new File(['fake'], 'test.jpg', { type: 'image/jpeg' });
    const url = await uploadGalleryPhoto({ scope: 'venues', entityId: 'carosello', file });
    expect(url).toBe('https://storage.example/photo.jpg');
    expect(mockRef).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/^venues\/carosello\/gallery\//)
    );
  });

  it('uploads to instructors/{id}/gallery for instructor scope', async () => {
    const file = new File(['fake'], 'test.jpg', { type: 'image/jpeg' });
    await uploadGalleryPhoto({ scope: 'instructors', entityId: 'provider-1', file });
    expect(mockRef).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/^instructors\/provider-1\/gallery\//)
    );
  });

  it('compresses image before upload', async () => {
    const file = new File(['fake'], 'test.jpg', { type: 'image/jpeg' });
    await uploadGalleryPhoto({ scope: 'venues', entityId: 'x', file });
    expect(mockCompression).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ maxSizeMB: 1, maxWidthOrHeight: 1200 })
    );
  });
});

describe('deleteGalleryPhoto', () => {
  it('parses storage path from URL and calls deleteObject', async () => {
    const url = 'https://firebasestorage.googleapis.com/v0/b/bucket/o/venues%2Fcarosello%2Fgallery%2F123.jpg?alt=media&token=x';
    await deleteGalleryPhoto(url);
    expect(mockRef).toHaveBeenCalledWith(
      expect.anything(),
      'venues/carosello/gallery/123.jpg'
    );
    expect(mockDeleteObject).toHaveBeenCalled();
  });

  it('does not throw when URL is unparseable (best-effort delete)', async () => {
    await expect(deleteGalleryPhoto('not-a-firebase-url')).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/firebase/photos.test.ts`
Expected: FAIL — "Cannot find module './photos'"

- [ ] **Step 3: Write implementation**

```ts
// src/lib/firebase/photos.ts
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './config';
import imageCompression from 'browser-image-compression';

const COMPRESSION_OPTIONS = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1200,
  useWebWorker: true,
};

export type GalleryScope = 'venues' | 'instructors';

export async function uploadGalleryPhoto(opts: {
  scope: GalleryScope;
  entityId: string;
  file: File;
}): Promise<string> {
  const { scope, entityId, file } = opts;
  const compressed = await imageCompression(file, COMPRESSION_OPTIONS);
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const path = `${scope}/${entityId}/gallery/${filename}`;
  const objRef = ref(storage, path);
  const snapshot = await uploadBytes(objRef, compressed, { contentType: 'image/jpeg' });
  return getDownloadURL(snapshot.ref);
}

/**
 * Deletes a gallery photo by its Firebase Storage download URL.
 * Best-effort: silently swallows parse failures so callers can call this
 * defensively when removing photos from a Firestore array.
 */
export async function deleteGalleryPhoto(downloadUrl: string): Promise<void> {
  try {
    // Extract storage path from URL like:
    //   https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<encoded-path>?alt=media&token=...
    const match = downloadUrl.match(/\/o\/([^?]+)/);
    if (!match) return;
    const path = decodeURIComponent(match[1]);
    const objRef = ref(storage, path);
    await deleteObject(objRef);
  } catch (error) {
    console.error('[deleteGalleryPhoto]', downloadUrl, error);
  }
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/lib/firebase/photos.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/firebase/photos.ts src/lib/firebase/photos.test.ts
git commit -m "feat(storage): uploadGalleryPhoto + deleteGalleryPhoto helpers"
```

---

## Task 4: Firestore write helpers + hooks

**Files:**
- Modify: `src/lib/firebase/venues.ts` — add `updateVenuePhotos`
- Modify: `src/lib/firebase/providers.ts` — add `updateProviderPhotos`
- Create: `src/hooks/usePhotoUpload.ts`
- Modify: `src/hooks/index.ts` — re-export new hooks

- [ ] **Step 1: Add updateVenuePhotos to venues.ts**

Append to `src/lib/firebase/venues.ts`:

```ts
import { doc as fsDoc, updateDoc } from 'firebase/firestore';
// (Note: `doc` already imported at top of file as `doc`; rename only if collision occurs)

export async function updateVenuePhotos(venueId: string, photoUrls: string[]): Promise<void> {
  await updateDoc(doc(db, 'venues', venueId), { photoUrls });
}
```

(Adjust the import — the file already imports `doc` and `db`; just add `updateDoc` to the existing `firebase/firestore` import and skip the alias.)

- [ ] **Step 2: Add updateProviderPhotos to providers.ts**

Append to `src/lib/firebase/providers.ts`:

```ts
export async function updateProviderPhotos(providerId: string, photoUrls: string[]): Promise<void> {
  await updateDoc(doc(db, 'instructors', providerId), { photoUrls });
}
```

(Add `updateDoc` to the existing `firebase/firestore` import in that file.)

- [ ] **Step 3: Create hook wrappers**

```ts
// src/hooks/usePhotoUpload.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateVenuePhotos } from '@/lib/firebase/venues';
import { updateProviderPhotos } from '@/lib/firebase/providers';

export function useUpdateVenuePhotos(venueId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (photoUrls: string[]) => {
      if (!venueId) throw new Error('venueId required');
      await updateVenuePhotos(venueId, photoUrls);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['venue', venueId] });
      void qc.invalidateQueries({ queryKey: ['venues'] });
    },
  });
}

export function useUpdateProviderPhotos(providerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (photoUrls: string[]) => {
      if (!providerId) throw new Error('providerId required');
      await updateProviderPhotos(providerId, photoUrls);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['provider', providerId] });
      void qc.invalidateQueries({ queryKey: ['providers'] });
    },
  });
}
```

- [ ] **Step 4: Re-export from hooks/index.ts**

Append to `src/hooks/index.ts`:

```ts
export { useUpdateVenuePhotos, useUpdateProviderPhotos } from './usePhotoUpload';
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/firebase/venues.ts src/lib/firebase/providers.ts src/hooks/usePhotoUpload.ts src/hooks/index.ts
git commit -m "feat(photos): updateVenuePhotos/updateProviderPhotos + TanStack mutation hooks"
```

---

## Task 5: PhotoGallery + PhotoLightbox + PhotoCover (display components)

**Files:**
- Create: `src/components/gallery/PhotoGallery.tsx`
- Create: `src/components/gallery/PhotoLightbox.tsx`
- Create: `src/components/gallery/PhotoCover.tsx`

- [ ] **Step 1: Create PhotoCover (simplest, no state)**

```tsx
// src/components/gallery/PhotoCover.tsx
import { cn } from '@/lib/utils';

interface PhotoCoverProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
}

/**
 * Single cover image for list cards. Renders the photo if present,
 * otherwise renders the fallback (typically a gradient block).
 */
export function PhotoCover({ src, alt, className, fallback }: PhotoCoverProps) {
  if (!src) {
    return <>{fallback}</>;
  }
  return (
    <div className={cn('relative h-full w-full overflow-hidden', className)}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  );
}
```

- [ ] **Step 2: Create PhotoLightbox**

```tsx
// src/components/gallery/PhotoLightbox.tsx
'use client';
import { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface PhotoLightboxProps {
  photos: string[];
  initialIndex: number;
  onClose: () => void;
}

export function PhotoLightbox({ photos, initialIndex, onClose }: PhotoLightboxProps) {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(photos.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photos.length, onClose]);

  if (photos.length === 0) return null;

  const prev = () => setIndex((i) => Math.max(0, i - 1));
  const next = () => setIndex((i) => Math.min(photos.length - 1, i + 1));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
        aria-label="Chiudi"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={photos[index]}
        alt={`Foto ${index + 1} di ${photos.length}`}
        className="max-h-screen max-w-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      {index > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            prev();
          }}
          className="absolute left-4 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white"
          aria-label="Precedente"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {index < photos.length - 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            next();
          }}
          className="absolute right-4 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white"
          aria-label="Successiva"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
        {index + 1} / {photos.length}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create PhotoGallery**

```tsx
// src/components/gallery/PhotoGallery.tsx
'use client';
import { useState } from 'react';
import { PhotoLightbox } from './PhotoLightbox';
import { cn } from '@/lib/utils';

interface PhotoGalleryProps {
  photos: string[];
  className?: string;
}

export function PhotoGallery({ photos, className }: PhotoGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (photos.length === 0) return null;

  return (
    <>
      <div
        className={cn(
          'flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2 scrollbar-hide',
          className
        )}
      >
        {photos.map((url, i) => (
          <button
            key={url}
            type="button"
            onClick={() => setLightboxIndex(i)}
            className="relative h-56 w-72 flex-shrink-0 snap-center overflow-hidden rounded-2xl bg-slate-200"
            aria-label={`Apri foto ${i + 1}`}
          >
            <img
              src={url}
              alt={`Foto ${i + 1}`}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </button>
        ))}
      </div>
      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/gallery/PhotoCover.tsx src/components/gallery/PhotoLightbox.tsx src/components/gallery/PhotoGallery.tsx
git commit -m "feat(gallery): PhotoCover, PhotoGallery, PhotoLightbox display components"
```

---

## Task 6: PhotoUploader + PhotoEditorOverlay (upload components)

**Files:**
- Create: `src/components/gallery/PhotoUploader.tsx`
- Create: `src/components/gallery/PhotoEditorOverlay.tsx`

- [ ] **Step 1: Create PhotoUploader**

```tsx
// src/components/gallery/PhotoUploader.tsx
'use client';
import { useRef, useState } from 'react';
import { Camera as CameraIcon, X, Loader2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { uploadGalleryPhoto, deleteGalleryPhoto, type GalleryScope } from '@/lib/firebase/photos';
import { cn } from '@/lib/utils';

interface PhotoUploaderProps {
  scope: GalleryScope;
  entityId: string;
  photos: string[];
  onChange: (newPhotos: string[]) => void;
  maxPhotos?: number;
  disabled?: boolean;
}

const MAX_PHOTOS_DEFAULT = 10;

export function PhotoUploader({
  scope,
  entityId,
  photos,
  onChange,
  maxPhotos = MAX_PHOTOS_DEFAULT,
  disabled = false,
}: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAdd = photos.length < maxPhotos && !disabled && !busy;

  async function captureNative(): Promise<File | null> {
    try {
      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
      });
      if (!photo.dataUrl) return null;
      const res = await fetch(photo.dataUrl);
      const blob = await res.blob();
      return new File([blob], `${Date.now()}.jpg`, { type: 'image/jpeg' });
    } catch (err) {
      console.warn('[PhotoUploader] capture cancelled or denied', err);
      return null;
    }
  }

  async function uploadFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const url = await uploadGalleryPhoto({ scope, entityId, file });
      onChange([...photos, url]);
    } catch (err) {
      console.error('[PhotoUploader] upload failed', err);
      setError("Caricamento non riuscito. Riprova.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddClick() {
    if (!canAdd) return;
    if (Capacitor.isNativePlatform()) {
      const file = await captureNative();
      if (file) await uploadFile(file);
    } else {
      inputRef.current?.click();
    }
  }

  async function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) await uploadFile(f);
    // reset so the same file can be picked again later
    e.target.value = '';
  }

  async function handleDelete(url: string) {
    onChange(photos.filter((p) => p !== url));
    await deleteGalleryPhoto(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {photos.map((url, i) => (
          <div
            key={url}
            className="relative h-28 w-28 flex-shrink-0 overflow-hidden rounded-xl bg-slate-200"
          >
            <img src={url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => handleDelete(url)}
              className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white"
              aria-label="Rimuovi foto"
            >
              <X className="h-3 w-3" />
            </button>
            {i === 0 && (
              <span className="absolute bottom-1 left-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                Copertina
              </span>
            )}
          </div>
        ))}
        {canAdd && (
          <button
            type="button"
            onClick={handleAddClick}
            className={cn(
              'inline-flex h-28 w-28 flex-shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-white/30 bg-white/5 text-text-secondary',
              busy && 'opacity-50'
            )}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CameraIcon className="h-5 w-5" />}
            <span className="text-[10px]">{busy ? 'Caricamento' : 'Aggiungi'}</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFilePicked}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <p className="text-xs text-text-tertiary">
        {photos.length} / {maxPhotos} foto. La prima e usata come copertina.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Create PhotoEditorOverlay**

```tsx
// src/components/gallery/PhotoEditorOverlay.tsx
'use client';
import { useEffect } from 'react';
import { X } from 'lucide-react';

interface PhotoEditorOverlayProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function PhotoEditorOverlay({ title, onClose, children }: PhotoEditorOverlayProps) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[#1a1d29] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-inverse">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white"
            aria-label="Chiudi"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/gallery/PhotoUploader.tsx src/components/gallery/PhotoEditorOverlay.tsx
git commit -m "feat(gallery): PhotoUploader (Capacitor camera + file input) and PhotoEditorOverlay"
```

---

## Task 7: Seed extension — generateDemoPhotos

**Files:**
- Modify: `functions/src/seed/seedData.ts`

- [ ] **Step 1: Add demo photo pools + function**

Insert this block in `functions/src/seed/seedData.ts` immediately after `generateDemoClients`:

```ts
// ===== Demo photo pools =====

const GYM_PHOTOS = [
  'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800',
  'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=800',
  'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=800',
  'https://images.unsplash.com/photo-1554284126-aa88f22d8b74?w=800',
  'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800',
  'https://images.unsplash.com/photo-1576678927484-cc907957088c?w=800',
  'https://images.unsplash.com/photo-1593079831268-3381b0db4a77?w=800',
  'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=800',
];

const WELLNESS_PHOTOS = [
  'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=800',
  'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800',
  'https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=800',
  'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=800',
  'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800',
];

const SPA_PHOTOS = [
  'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=800',
  'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800',
  'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800',
];

const BEAUTY_PHOTOS = [
  'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800',
  'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800',
  'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=800',
];

const TRAINER_PHOTOS = [
  'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800',
  'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=800',
  'https://images.unsplash.com/photo-1583500178690-f7fd39f6e7b9?w=800',
  'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800',
  'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=800',
  'https://images.unsplash.com/photo-1594381898411-846e7d193883?w=800',
  'https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=800',
  'https://images.unsplash.com/photo-1530549387789-4c1017266635?w=800',
];

// Deterministic per-id pick using a simple hash.
function pickPhotos(id: string, pool: string[], count: number): string[] {
  let seed = 0;
  for (let i = 0; i < id.length; i++) {
    seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
  }
  const indexes = new Set<number>();
  let n = seed;
  while (indexes.size < Math.min(count, pool.length)) {
    n = (n * 1103515245 + 12345) >>> 0;
    indexes.add(n % pool.length);
  }
  return Array.from(indexes).map((i) => pool[i]);
}

export async function generateDemoPhotos(): Promise<SeedingResult[]> {
  const results: SeedingResult[] = [];

  // ===== Venues =====
  try {
    const venuesSnap = await db.collection("venues").get();
    const batch = db.batch();
    let count = 0;
    for (const docSnap of venuesSnap.docs) {
      const type = docSnap.data().type as string | undefined;
      const pool =
        type === "spa" ? SPA_PHOTOS :
        type === "beauty_salon" ? BEAUTY_PHOTOS :
        type === "wellness_center" ? WELLNESS_PHOTOS :
        GYM_PHOTOS;
      const photoUrls = pickPhotos(docSnap.id, pool, 5);
      batch.set(docSnap.ref, { photoUrls }, { merge: true });
      count++;
    }
    await batch.commit();
    results.push({ success: true, collection: "venues (photos)", count });
  } catch (error) {
    results.push({
      success: false,
      collection: "venues (photos)",
      count: 0,
      error: error instanceof Error ? error.message : "Unknown",
    });
  }

  // ===== Instructors =====
  try {
    const instructorsSnap = await db.collection("instructors").get();
    let batch = db.batch();
    let opCount = 0;
    let total = 0;
    for (const docSnap of instructorsSnap.docs) {
      const photoUrls = pickPhotos(docSnap.id, TRAINER_PHOTOS, 4);
      batch.set(docSnap.ref, { photoUrls }, { merge: true });
      opCount++;
      total++;
      if (opCount >= 400) {
        await batch.commit();
        batch = db.batch();
        opCount = 0;
      }
    }
    if (opCount > 0) await batch.commit();
    results.push({ success: true, collection: "instructors (photos)", count: total });
  } catch (error) {
    results.push({
      success: false,
      collection: "instructors (photos)",
      count: 0,
      error: error instanceof Error ? error.message : "Unknown",
    });
  }

  return results;
}
```

- [ ] **Step 2: Build + lint functions**

Run: `npm --prefix functions run build && npm --prefix functions run lint`
Expected: success. If lint reports errors in your new code (quotes, line length), fix them.

- [ ] **Step 3: Run the seed locally**

```bash
cd /Users/hidranarias/projects/vfit/functions
GOOGLE_APPLICATION_CREDENTIALS=~/.config/firebase-cli-adc.json GOOGLE_CLOUD_PROJECT=vfit-funlife node -e "
import('firebase-admin').then(async ({default: admin}) => {
  admin.initializeApp({projectId: 'vfit-funlife'});
  const mod = await import('./lib/seed/seedData.js');
  console.log('[seed] generateDemoPhotos starting...');
  const start = Date.now();
  const results = await mod.generateDemoPhotos();
  console.log('[seed] done in', ((Date.now()-start)/1000).toFixed(1), 's');
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
});
" 2>&1 | tail -20
```

Expected output:
```
{ "success": true, "collection": "venues (photos)",       "count": 120 }
{ "success": true, "collection": "instructors (photos)",  "count": 320 }
```

- [ ] **Step 4: Commit**

```bash
git add functions/src/seed/seedData.ts
git commit -m "feat(seed): generateDemoPhotos — curated Unsplash URLs for all demo venues and trainers"
```

---

## Task 8: Wire PhotoGallery into detail pages

**Files:**
- Modify: `src/app/(main)/venue/VenueDetailClient.tsx`
- Modify: `src/app/book/BookingClient.tsx`

- [ ] **Step 1: Update VenueDetailClient**

In `src/app/(main)/venue/VenueDetailClient.tsx`:

Add import at the top:
```ts
import { PhotoGallery } from '@/components/gallery/PhotoGallery';
```

Find the hero block — currently maps over `slides = venue.heroGradients`. Replace it with a conditional: if `venue.photoUrls?.length`, render `<PhotoGallery>` instead of the gradient slides:

Find:
```tsx
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
```

Replace with:
```tsx
        {venue.photoUrls && venue.photoUrls.length > 0 ? (
          <div className="px-4 pt-4">
            <PhotoGallery photos={venue.photoUrls} />
          </div>
        ) : (
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
        )}
```

- [ ] **Step 2: Update BookingClient**

In `src/app/book/BookingClient.tsx`:

Add import:
```ts
import { PhotoGallery } from '@/components/gallery/PhotoGallery';
```

Find the provider name/profile block (just after `if (!provider) return ...`). Add the gallery directly after the name/avatar header, before the tabs.

If the file has a structure like:
```tsx
{/* Provider info section */}
<div className="...provider header...">{provider.fullName}...</div>
{/* Tabs */}
<div className="...tabs...">
```

Insert between them:
```tsx
{provider.photoUrls && provider.photoUrls.length > 0 && (
  <div className="mt-4">
    <PhotoGallery photos={provider.photoUrls} />
  </div>
)}
```

If the exact JSX structure doesn't match (file may have evolved), place the gallery somewhere visually sensible — between the provider's intro card and the Services tab. Keep the change minimal.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Manual smoke**

In dev (`npm run dev` if not running), visit:
- `http://localhost:3000/venue/?id=carosello` — should show 5 Unsplash photos in carousel; tap one opens lightbox
- `http://localhost:3000/book/?providerId=demo-trainer-yoga-01` — should show 4 photos above the tabs

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(main)/venue/VenueDetailClient.tsx' src/app/book/BookingClient.tsx
git commit -m "feat(gallery): render PhotoGallery on venue and provider detail pages"
```

---

## Task 9: Wire PhotoCover into list cards

**Files:**
- Modify: `src/app/(main)/fit/gyms/page.tsx`
- Modify: `src/app/booking/page.tsx`

- [ ] **Step 1: Update fit/gyms cards**

Find the card render block in `src/app/(main)/fit/gyms/page.tsx`. It currently has a gradient hero block per card. Add import:

```ts
import { PhotoCover } from '@/components/gallery/PhotoCover';
```

Locate where the gradient `<div className="h-28 ...gradient...">` is rendered. Wrap that gradient div as the `fallback` prop, and put `<PhotoCover>` in its place:

```tsx
<PhotoCover
  src={gym.photoUrls?.[0]}
  alt={gym.name}
  className="h-28"
  fallback={
    <div className="h-28 bg-gradient-to-br from-vfit-secondary/40 via-vfit-primary/30 to-transparent" />
  }
/>
```

If the existing gradient classes were dynamic (e.g. based on index), keep that logic in the fallback prop.

- [ ] **Step 2: Update booking search cards**

Find the trainer card render in `src/app/booking/page.tsx` (around the `searchResults.map((provider) => ...)` block). Add import:

```ts
import { PhotoCover } from '@/components/gallery/PhotoCover';
```

The cards currently show a circular `?` avatar. Augment by adding a cover image above the existing info row (small change):

```tsx
{provider.photoUrls && provider.photoUrls[0] && (
  <div className="h-28 overflow-hidden rounded-t-2xl">
    <img
      src={provider.photoUrls[0]}
      alt={provider.fullName}
      loading="lazy"
      className="h-full w-full object-cover"
    />
  </div>
)}
```

(Using a direct `<img>` here rather than `<PhotoCover>` because there's no gradient fallback needed — when no photo, just skip the cover and let the existing avatar carry the visual.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Smoke test**

Visit `http://localhost:3000/fit/gyms` — each gym card should show a real photo. Visit `http://localhost:3000/booking` — trainer cards should show photos.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(main)/fit/gyms/page.tsx' src/app/booking/page.tsx
git commit -m "feat(gallery): cover images on gym and trainer list cards"
```

---

## Task 10: Trainer Gallery tab on /provider/services

**Files:**
- Modify: `src/app/(main)/provider/services/page.tsx`

- [ ] **Step 1: Add tab state + Gallery tab content**

In `src/app/(main)/provider/services/page.tsx`:

Add imports near the existing imports:

```ts
import { useState } from 'react';   // verify if not already imported
import { useAuthStore } from '@/stores/authStore';
import { useProvider } from '@/hooks/useProviders';
import { useUpdateProviderPhotos } from '@/hooks/usePhotoUpload';
import { PhotoUploader } from '@/components/gallery/PhotoUploader';
import { cn } from '@/lib/utils';
```

Inside the default-exported component, near the top of the function body (after the existing `useState`s + `useEffect`), add:

```ts
const [activeTab, setActiveTab] = useState<'services' | 'gallery'>('services');
const firebaseUser = useAuthStore((s) => s.firebaseUser);
const uid = firebaseUser?.uid;
const { data: provider } = useProvider(uid);
const updatePhotos = useUpdateProviderPhotos(uid);
const photos = provider?.photoUrls ?? [];
```

Find the main return block. Wrap the existing services list rendering in `{activeTab === 'services' && (... existing JSX ...)}`. Insert a tab bar above the existing services rendering, and the gallery section as a sibling for `activeTab === 'gallery'`:

Structure:
```tsx
<div className="...existing wrapper...">
  {/* Tab bar */}
  <div className="mb-4 flex gap-2 border-b border-white/10">
    <button
      type="button"
      onClick={() => setActiveTab('services')}
      className={cn(
        'border-b-2 px-3 py-2 text-sm font-medium',
        activeTab === 'services'
          ? 'border-section-primary text-text-inverse'
          : 'border-transparent text-text-secondary'
      )}
    >
      Servizi
    </button>
    <button
      type="button"
      onClick={() => setActiveTab('gallery')}
      className={cn(
        'border-b-2 px-3 py-2 text-sm font-medium',
        activeTab === 'gallery'
          ? 'border-section-primary text-text-inverse'
          : 'border-transparent text-text-secondary'
      )}
    >
      Galleria
    </button>
  </div>

  {/* Services tab */}
  {activeTab === 'services' && (
    /* existing services JSX preserved verbatim */
  )}

  {/* Gallery tab */}
  {activeTab === 'gallery' && (
    <div>
      {!uid ? (
        <p className="text-sm text-text-secondary">Accedi per gestire la tua galleria.</p>
      ) : (
        <PhotoUploader
          scope="instructors"
          entityId={uid}
          photos={photos}
          onChange={(newPhotos) => updatePhotos.mutate(newPhotos)}
          disabled={updatePhotos.isPending}
        />
      )}
    </div>
  )}
</div>
```

(Wrap the existing services JSX inside the `activeTab === 'services' &&` conditional. Do not remove or duplicate the existing services code.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Manual smoke**

Sign in as any user (or unauthenticated will see the "Accedi" message). Visit `/provider/services`. Toggle to "Galleria" tab. Add photo flow should open file picker on web. For demo, manually verify the UI shape.

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(main)/provider/services/page.tsx'
git commit -m "feat(provider): add Galleria tab on /provider/services with PhotoUploader"
```

---

## Task 11: Venue admin Foto modal on /admin/venues

**Files:**
- Modify: `src/app/admin/venues/page.tsx`

- [ ] **Step 1: Add Foto button per row + overlay state**

In `src/app/admin/venues/page.tsx`:

Add imports:

```ts
import { useState } from 'react';   // verify if not already imported
import { PhotoUploader } from '@/components/gallery/PhotoUploader';
import { PhotoEditorOverlay } from '@/components/gallery/PhotoEditorOverlay';
import { useUpdateVenuePhotos } from '@/hooks/usePhotoUpload';
import { Camera } from 'lucide-react';
```

Inside the component, near other state declarations, add:

```ts
const [editingVenue, setEditingVenue] = useState<{ id: string; name: string; photoUrls: string[] } | null>(null);
const updateVenuePhotosM = useUpdateVenuePhotos(editingVenue?.id);
```

Find the columns definition (`columns: Column<Venue>[] = [...]`). Add a new column at the end:

```ts
{
  key: 'photos',
  header: 'Foto',
  cell: (venue) => (
    <button
      type="button"
      onClick={() =>
        setEditingVenue({
          id: venue.id,
          name: venue.name,
          // local Venue interface doesn't include photoUrls, so look up the
          // Firestore venue from the underlying hook results. Pass [] as
          // a safe initial; the uploader will pick up the latest on save.
          photoUrls: (venue as unknown as { photoUrls?: string[] }).photoUrls ?? [],
        })
      }
      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      aria-label="Modifica foto"
    >
      <Camera className="h-4 w-4" />
    </button>
  ),
},
```

The local `Venue` interface in this file (used for the admin table) doesn't include `photoUrls`. The mapping you have in `tableRows` currently strips it. Update the mapping to preserve photoUrls:

Find the existing:
```ts
const tableRows = venues.map((v) => ({
  // ...existing fields...
}));
```

Add `photoUrls: v.photoUrls ?? []` to the mapped object. Also extend the local `interface Venue` (in this file) with `photoUrls?: string[]`.

After the DataTable render, add (at the bottom of the component JSX, sibling to DataTable):

```tsx
{editingVenue && (
  <PhotoEditorOverlay
    title={`Foto — ${editingVenue.name}`}
    onClose={() => setEditingVenue(null)}
  >
    <PhotoUploader
      scope="venues"
      entityId={editingVenue.id}
      photos={editingVenue.photoUrls}
      onChange={(newPhotos) => {
        setEditingVenue({ ...editingVenue, photoUrls: newPhotos });
        updateVenuePhotosM.mutate(newPhotos);
      }}
      disabled={updateVenuePhotosM.isPending}
    />
  </PhotoEditorOverlay>
)}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Manual smoke**

As an admin user, visit `/admin/venues`. Click the camera icon on any row. Overlay should open with existing 5 photos (from the seeded data). Delete one — the array should update. Close the overlay.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/venues/page.tsx
git commit -m "feat(admin): venue photo editor modal on /admin/venues"
```

---

## Task 12: Final verification

**Files:** (verification only)

- [ ] **Step 1: All unit tests pass**

Run: `npm test -- --run 2>&1 | tail -15`
Expected: all tests pass, including the 5 new tests in `src/lib/firebase/photos.test.ts`.

- [ ] **Step 2: Production build succeeds**

Run: `npm run build 2>&1 | tail -10`
Expected: success.

- [ ] **Step 3: Type check clean**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Manual end-to-end walk**

With the dev server on `http://localhost:3000`:

1. `/fit/gyms` → cards now show real photos
2. Click a gym card → venue detail shows photo gallery; tap a photo → lightbox opens; arrow keys navigate
3. `/booking` → trainer cards show photos
4. Click a trainer → `/book?providerId=...` → photo gallery section above tabs
5. (Admin) `/admin/venues` → click camera icon on a row → overlay → delete one photo → confirm list updates
6. (Authenticated user) `/provider/services` → click "Galleria" tab → see existing photos and Add tile

- [ ] **Step 5: Storage rule sanity check via emulator (optional)**

Run: `npx firebase emulators:exec --only storage "echo storage-rules-ok" 2>&1 | tail -5`
Expected: emulator starts, compiles rules, exits 0.

- [ ] **Step 6: No additional commit unless polish needed**

Only commit if step 4 surfaced something fixable. Otherwise this task ends with no commit.

---

## Self-Review Notes

**Spec coverage:**
- Storage rules → Task 1 ✓
- Schema additions → Task 2 ✓
- Storage helpers → Task 3 ✓
- Firestore helpers + hooks → Task 4 ✓
- Display components → Task 5 ✓
- Upload components → Task 6 ✓
- Demo seed → Task 7 ✓
- Detail page gallery → Task 8 ✓
- List card covers → Task 9 ✓
- Trainer Galleria tab → Task 10 ✓
- Admin venue modal → Task 11 ✓
- Verification → Task 12 ✓

**Type consistency:**
- `GalleryScope` literal union is `'venues' | 'instructors'` used uniformly in Tasks 3, 6, 10, 11.
- `photoUrls` is `string[]` in types (Task 2), accessors (Task 4), components (Tasks 5-6, 10-11), and seed (Task 7). Optional (`photoUrls?`) on Firestore types — every consumer guards with `?? []`.
- `uploadGalleryPhoto({ scope, entityId, file })` signature consistent in Task 3 def and Task 6 caller.

**Placeholder scan:**
- No "TBD" / "TODO" / hand-wavy steps.
- All code blocks contain complete, copy-pasteable code.
- Task 8 step 2 has a small "if the JSX has evolved, place sensibly" — this is unavoidable since BookingClient was modified during the demo prep and exact structure may shift slightly. The instruction is concrete enough: render gallery between profile header and tabs.

**Bite-size check:**
- Heaviest tasks: Task 5 (3 components, ~200 lines total), Task 6 (PhotoUploader is ~120 lines), Task 10 (tab wiring touches a known file). Each under ~30 minutes of focused work.

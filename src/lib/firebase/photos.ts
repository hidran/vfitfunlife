import { ref, deleteObject } from 'firebase/storage';
import { getStorageInstance } from './config';
import { uploadImageWithThumbnail } from './storage';
import { PHOTO_DERIVATIVES, storagePathFromUrl, thumbnailPathFor } from './thumbnails';

export type GalleryScope = 'venues' | 'instructors';

/**
 * Uploads a gallery photo as a 1200px derivative plus a 320px thumbnail sibling
 * (`…_w1200.jpg` / `…_w320.jpg`, see ./thumbnails). Returns the full-size download URL,
 * which is what goes into the entity's `photoUrls` array; grids derive the thumbnail from it.
 */
export async function uploadGalleryPhoto(opts: {
  scope: GalleryScope;
  entityId: string;
  file: File;
}): Promise<string> {
  const { scope, entityId, file } = opts;
  const { url } = await uploadImageWithThumbnail({
    dir: `${scope}/${entityId}/gallery`,
    stem: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    spec: PHOTO_DERIVATIVES,
    maxSizeMB: 1,
  });
  return url;
}

/**
 * Deletes a gallery photo (and its thumbnail, when it has one) by its Firebase Storage
 * download URL. Best-effort: silently swallows parse failures so callers can call this
 * defensively when removing photos from a Firestore array.
 */
export async function deleteGalleryPhoto(downloadUrl: string): Promise<void> {
  try {
    const path = storagePathFromUrl(downloadUrl);
    if (!path) return;
    const storage = await getStorageInstance();
    const thumbPath = thumbnailPathFor(path);
    await Promise.all([
      deleteObject(ref(storage, path)),
      thumbPath
        ? deleteObject(ref(storage, thumbPath)).catch(() => {
            /* thumbnail missing: nothing to clean up */
          })
        : Promise.resolve(),
    ]);
  } catch (error) {
    console.error('[deleteGalleryPhoto]', downloadUrl, error);
  }
}

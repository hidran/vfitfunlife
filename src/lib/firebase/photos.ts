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
    const match = downloadUrl.match(/\/o\/([^?]+)/);
    if (!match) return;
    const path = decodeURIComponent(match[1]);
    const objRef = ref(storage, path);
    await deleteObject(objRef);
  } catch (error) {
    console.error('[deleteGalleryPhoto]', downloadUrl, error);
  }
}

import { getStorageInstance } from '@/lib/firebase/config';
import {
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  listAll,
} from 'firebase/storage';
import type { Options as ImageCompressionOptions } from 'browser-image-compression';
import {
  AVATAR_DERIVATIVES,
  PHOTO_DERIVATIVES,
  derivativePaths,
  isThumbnailPath,
  storagePathFromUrl,
  thumbnailPathFor,
  thumbnailUrl,
  type DerivativeSpec,
} from './thumbnails';

// Default compression options
const defaultCompressionOptions = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1200,
  useWebWorker: true,
};

const avatarCompressionOptions = {
  maxSizeMB: 0.5,
  maxWidthOrHeight: AVATAR_DERIVATIVES.full,
  useWebWorker: true,
};

/**
 * Dynamic import: browser-image-compression (and its web worker) only need to load for
 * someone actually uploading a photo, not on every page that imports this module.
 */
async function compressImage(file: File, options: ImageCompressionOptions): Promise<File> {
  const { default: imageCompression } = await import('browser-image-compression');
  return imageCompression(file, options);
}

export interface UploadedImage {
  /** Download URL of the full-size derivative (what gets stored in Firestore). */
  url: string;
  /** Storage path of the full-size derivative. */
  path: string;
  /** Token-less URL of the thumbnail, or null if the thumbnail upload failed. */
  thumbUrl: string | null;
  /** Storage path of the thumbnail (sibling of `path`). */
  thumbPath: string;
}

/**
 * Compresses `file` into a full-size derivative plus a thumbnail (see ./thumbnails for the
 * naming convention that links them) and uploads both to `${dir}/`. The thumbnail is
 * best-effort: if it fails the full image is still returned, and renderers fall back to it.
 */
export async function uploadImageWithThumbnail(opts: {
  dir: string;
  stem: string;
  file: File;
  spec: DerivativeSpec;
  maxSizeMB: number;
}): Promise<UploadedImage> {
  const { dir, stem, file, spec, maxSizeMB } = opts;
  const full = await compressImage(file, {
    maxSizeMB,
    maxWidthOrHeight: spec.full,
    useWebWorker: true,
  });
  const names = derivativePaths(stem, spec);
  const path = `${dir}/${names.full}`;
  const thumbPath = `${dir}/${names.thumb}`;
  const contentType = full.type || 'image/jpeg';

  const storage = await getStorageInstance();
  const thumbUpload = (async () => {
    const thumb = await compressImage(full, {
      maxSizeMB: 0.1,
      maxWidthOrHeight: spec.thumb,
      useWebWorker: true,
    });
    await uploadBytes(ref(storage, thumbPath), thumb, { contentType: thumb.type || contentType });
    return true;
  })().catch((error) => {
    console.warn('[uploadImageWithThumbnail] thumbnail upload failed', thumbPath, error);
    return false;
  });

  const snapshot = await uploadBytes(ref(storage, path), full, { contentType });
  const [url, thumbOk] = await Promise.all([getDownloadURL(snapshot.ref), thumbUpload]);
  return { url, path, thumbUrl: thumbOk ? thumbnailUrl(url) : null, thumbPath };
}

/**
 * Deletes an image by download URL together with its thumbnail (if it has one).
 * The thumbnail delete is best-effort: legacy images have none.
 */
async function deleteImageAndThumbnail(fileUrl: string): Promise<void> {
  const storage = await getStorageInstance();
  const path = storagePathFromUrl(fileUrl);
  const thumbPath = path ? thumbnailPathFor(path) : null;
  if (thumbPath) {
    deleteObject(ref(storage, thumbPath)).catch(() => {
      /* already gone / never uploaded */
    });
  }
  await deleteObject(ref(storage, path ?? fileUrl));
}

// Upload avatar with compression (plus a 128px thumbnail for lists)
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  try {
    // Upload to Storage - matching storage.rules path: /users/{userId}/avatar/{fileName}
    const { url } = await uploadImageWithThumbnail({
      dir: `users/${userId}/avatar`,
      stem: String(Date.now()),
      file,
      spec: AVATAR_DERIVATIVES,
      maxSizeMB: avatarCompressionOptions.maxSizeMB,
    });
    return url;
  } catch (error) {
    console.error('Upload avatar error:', error);
    throw error;
  }
}

// Update profile photo
export async function updateProfilePhoto(userId: string, file: File): Promise<string> {
  try {
    // Upload to profile-photos path (full 500px + 128px thumbnail for lists)
    const { url } = await uploadImageWithThumbnail({
      dir: `profile-photos/${userId}`,
      stem: String(Date.now()),
      file,
      spec: AVATAR_DERIVATIVES,
      maxSizeMB: avatarCompressionOptions.maxSizeMB,
    });
    return url;
  } catch (error) {
    console.error('Update profile photo error:', error);
    throw error;
  }
}

// Upload certification document
export async function uploadCertification(
  userId: string,
  file: File,
  name: string
): Promise<string> {
  try {
    // Validate file type (only allow PDFs and images)
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Invalid file type. Only PDF, JPEG, and PNG are allowed.');
    }

    // Compress if it's an image
    let fileToUpload: File = file;
    if (file.type.startsWith('image/')) {
      fileToUpload = await compressImage(file, defaultCompressionOptions);
    }

    // Upload to certifications path
    const extension = file.type === 'application/pdf' ? 'pdf' : 'jpg';
    const storage = await getStorageInstance();
    const storageRef = ref(storage, `certifications/${userId}/${name}_${Date.now()}.${extension}`);
    const snapshot = await uploadBytes(storageRef, fileToUpload);

    // Get download URL
    const downloadURL = await getDownloadURL(snapshot.ref);

    return downloadURL;
  } catch (error) {
    console.error('Upload certification error:', error);
    throw error;
  }
}

// Delete certification
export async function deleteCertification(fileUrl: string): Promise<void> {
  try {
    const storage = await getStorageInstance();
    const fileRef = ref(storage, fileUrl);
    await deleteObject(fileRef);
  } catch (error) {
    console.error('Delete certification error:', error);
    throw error;
  }
}

// Upload portfolio image
export async function uploadPortfolioImage(userId: string, file: File): Promise<string> {
  try {
    // Upload to portfolios path (full 1200px + 320px thumbnail for the grid)
    const { url } = await uploadImageWithThumbnail({
      dir: `portfolios/${userId}`,
      stem: String(Date.now()),
      file,
      spec: PHOTO_DERIVATIVES,
      maxSizeMB: defaultCompressionOptions.maxSizeMB,
    });
    return url;
  } catch (error) {
    console.error('Upload portfolio image error:', error);
    throw error;
  }
}

// Delete portfolio image (and its thumbnail)
export async function deletePortfolioImage(fileUrl: string): Promise<void> {
  try {
    await deleteImageAndThumbnail(fileUrl);
  } catch (error) {
    console.error('Delete portfolio image error:', error);
    throw error;
  }
}

// Get all portfolio images for a user
export async function getPortfolioImages(userId: string): Promise<string[]> {
  try {
    const storage = await getStorageInstance();
    const portfolioRef = ref(storage, `portfolios/${userId}`);
    const result = await listAll(portfolioRef);
    const urls = await Promise.all(
      result.items
        .filter((item) => !isThumbnailPath(item.fullPath))
        .map((item) => getDownloadURL(item))
    );
    return urls;
  } catch (error) {
    console.error('Get portfolio images error:', error);
    return [];
  }
}

// Upload with progress tracking
export async function uploadWithProgress(
  path: string,
  file: File,
  onProgress: (progress: number) => void
): Promise<string> {
  const storage = await getStorageInstance();
  const storageRef = ref(storage, path);
  const uploadTask = uploadBytesResumable(storageRef, file);

  return new Promise<string>((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        onProgress(progress);
      },
      (error) => reject(error),
      async () => {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        resolve(downloadURL);
      }
    );
  });
}

// Delete file by URL
export async function deleteFile(fileUrl: string): Promise<void> {
  try {
    const storage = await getStorageInstance();
    const fileRef = ref(storage, fileUrl);
    await deleteObject(fileRef);
  } catch (error) {
    console.error('Delete file error:', error);
    throw error;
  }
}

// Get file path from URL
export function getFilePathFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathMatch = urlObj.pathname.match(/\/o\/(.+)$/);
    if (pathMatch) {
      return decodeURIComponent(pathMatch[1]);
    }
    return null;
  } catch {
    return null;
  }
}

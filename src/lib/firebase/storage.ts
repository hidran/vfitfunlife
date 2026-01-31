import { storage } from '@/lib/firebase/config';
import {
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  listAll,
} from 'firebase/storage';
import imageCompression from 'browser-image-compression';

// Default compression options
const defaultCompressionOptions = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1200,
  useWebWorker: true,
};

const avatarCompressionOptions = {
  maxSizeMB: 0.5,
  maxWidthOrHeight: 500,
  useWebWorker: true,
};

// Upload avatar with compression
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  try {
    // Compress image
    const compressedFile = await imageCompression(file, avatarCompressionOptions);

    // Upload to Storage - matching storage.rules path: /users/{userId}/avatar/{fileName}
    const storageRef = ref(storage, `users/${userId}/avatar/${Date.now()}.jpg`);
    const snapshot = await uploadBytes(storageRef, compressedFile);

    // Get download URL
    const downloadURL = await getDownloadURL(snapshot.ref);

    return downloadURL;
  } catch (error) {
    console.error('Upload avatar error:', error);
    throw error;
  }
}

// Update profile photo
export async function updateProfilePhoto(userId: string, file: File): Promise<string> {
  try {
    // Compress image for profile photo
    const compressedFile = await imageCompression(file, avatarCompressionOptions);

    // Upload to profile-photos path
    const storageRef = ref(storage, `profile-photos/${userId}/${Date.now()}.jpg`);
    const snapshot = await uploadBytes(storageRef, compressedFile);

    // Get download URL
    const downloadURL = await getDownloadURL(snapshot.ref);

    return downloadURL;
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
      fileToUpload = await imageCompression(file, defaultCompressionOptions);
    }

    // Upload to certifications path
    const extension = file.type === 'application/pdf' ? 'pdf' : 'jpg';
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
    // Compress image
    const compressedFile = await imageCompression(file, defaultCompressionOptions);

    // Upload to portfolios path
    const storageRef = ref(storage, `portfolios/${userId}/${Date.now()}.jpg`);
    const snapshot = await uploadBytes(storageRef, compressedFile);

    // Get download URL
    const downloadURL = await getDownloadURL(snapshot.ref);

    return downloadURL;
  } catch (error) {
    console.error('Upload portfolio image error:', error);
    throw error;
  }
}

// Delete portfolio image
export async function deletePortfolioImage(fileUrl: string): Promise<void> {
  try {
    const fileRef = ref(storage, fileUrl);
    await deleteObject(fileRef);
  } catch (error) {
    console.error('Delete portfolio image error:', error);
    throw error;
  }
}

// Get all portfolio images for a user
export async function getPortfolioImages(userId: string): Promise<string[]> {
  try {
    const portfolioRef = ref(storage, `portfolios/${userId}`);
    const result = await listAll(portfolioRef);
    const urls = await Promise.all(
      result.items.map((item) => getDownloadURL(item))
    );
    return urls;
  } catch (error) {
    console.error('Get portfolio images error:', error);
    return [];
  }
}

// Upload with progress tracking
export function uploadWithProgress(
  path: string,
  file: File,
  onProgress: (progress: number) => void
): Promise<string> {
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

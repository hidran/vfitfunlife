import { storage } from '@/lib/firebase/config';
import {
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import imageCompression from 'browser-image-compression';

// Upload avatar with compression
export async function uploadAvatar(userId: string, file: File) {
  try {
    // Compress image
    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 500,
      useWebWorker: true,
    };

    const compressedFile = await imageCompression(file, options);

    // Upload to Storage - matching storage.rules path: /users/{userId}/avatar/{fileName}
    const storageRef = ref(storage, `users/${userId}/avatar/${Date.now()}.jpg`);
    const snapshot = await uploadBytes(storageRef, compressedFile);

    // Get download URL
    const downloadURL = await getDownloadURL(snapshot.ref);

    return downloadURL;
  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }
}

// Upload with progress tracking
export function uploadWithProgress(
  path: string,
  file: File,
  onProgress: (progress: number) => void
) {
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

// Delete file
export async function deleteFile(fileUrl: string) {
  const fileRef = ref(storage, fileUrl);
  await deleteObject(fileRef);
}

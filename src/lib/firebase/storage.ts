import {
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  UploadTask,
  UploadTaskSnapshot,
} from "firebase/storage";
import { storage } from "./config";

type UploadProgressCallback = (progress: number) => void;

/**
 * Upload user avatar
 */
export async function uploadAvatar(
  userId: string,
  file: File | Blob,
  onProgress?: UploadProgressCallback
): Promise<string> {
  const extension = file instanceof File ? file.name.split(".").pop() : "jpg";
  const path = `users/${userId}/avatar/avatar.${extension}`;

  return uploadFile(path, file, onProgress);
}

/**
 * Upload review image
 */
export async function uploadReviewImage(
  reviewId: string,
  file: File | Blob,
  index: number,
  onProgress?: UploadProgressCallback
): Promise<string> {
  const extension = file instanceof File ? file.name.split(".").pop() : "jpg";
  const path = `reviews/${reviewId}/image_${index}.${extension}`;

  return uploadFile(path, file, onProgress);
}

/**
 * Upload user document/receipt
 */
export async function uploadUserDocument(
  userId: string,
  file: File | Blob,
  fileName: string,
  onProgress?: UploadProgressCallback
): Promise<string> {
  const path = `users/${userId}/uploads/${fileName}`;
  return uploadFile(path, file, onProgress);
}

/**
 * Generic file upload with progress tracking
 */
export async function uploadFile(
  path: string,
  file: File | Blob,
  onProgress?: UploadProgressCallback
): Promise<string> {
  const storageRef = ref(storage, path);

  if (onProgress) {
    const uploadTask = uploadBytesResumable(storageRef, file);

    return new Promise((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot: UploadTaskSnapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          onProgress(progress);
        },
        (error) => {
          reject(error);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadURL);
        }
      );
    });
  } else {
    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
  }
}

/**
 * Delete a file from storage
 */
export async function deleteFile(path: string): Promise<void> {
  const storageRef = ref(storage, path);
  await deleteObject(storageRef);
}

/**
 * Get download URL for a file
 */
export async function getFileUrl(path: string): Promise<string> {
  const storageRef = ref(storage, path);
  return getDownloadURL(storageRef);
}

/**
 * Compress image before upload (client-side)
 */
export async function compressImage(
  file: File,
  maxWidth: number = 1200,
  quality: number = 0.8
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Could not compress image"));
            }
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => reject(new Error("Could not load image"));
    };
    reader.onerror = () => reject(new Error("Could not read file"));
  });
}

/**
 * Validate file type
 */
export function isValidImageType(file: File): boolean {
  const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  return validTypes.includes(file.type);
}

/**
 * Validate file size (in bytes)
 */
export function isValidFileSize(file: File, maxSizeBytes: number): boolean {
  return file.size <= maxSizeBytes;
}

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

import { ref, uploadBytes, deleteObject } from 'firebase/storage';
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

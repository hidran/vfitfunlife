import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadGalleryPhoto, deleteGalleryPhoto } from './photos';

vi.mock('firebase/storage', () => ({
  ref: vi.fn((_storage, path: string) => ({ fullPath: path })),
  uploadBytes: vi.fn().mockResolvedValue({ ref: { fullPath: 'mock' } }),
  uploadBytesResumable: vi.fn(),
  getDownloadURL: vi.fn().mockResolvedValue('https://storage.example/photo.jpg'),
  deleteObject: vi.fn().mockResolvedValue(undefined),
  listAll: vi.fn(),
  getStorage: vi.fn(() => ({})),
}));

vi.mock('./config', () => ({
  getStorageInstance: vi.fn().mockResolvedValue({}),
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
  mockUploadBytes.mockResolvedValue({ ref: { fullPath: 'mock' } } as never);
});

const refPaths = () => mockRef.mock.calls.map((c) => c[1] as string);

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

  it('uploads a 1200px full image and a 320px thumbnail sibling', async () => {
    const file = new File(['fake'], 'test.jpg', { type: 'image/jpeg' });
    await uploadGalleryPhoto({ scope: 'venues', entityId: 'x', file });
    const full = refPaths().find((p) => p.endsWith('_w1200.jpg'));
    const thumb = refPaths().find((p) => p.endsWith('_w320.jpg'));
    expect(full).toMatch(/^venues\/x\/gallery\/\d+-[a-z0-9]+_w1200\.jpg$/);
    expect(thumb).toBe(full!.replace('_w1200.jpg', '_w320.jpg'));
    expect(mockUploadBytes).toHaveBeenCalledTimes(2);
    expect(mockCompression).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ maxWidthOrHeight: 320 })
    );
  });

  it('still returns the full URL when the thumbnail upload fails', async () => {
    mockUploadBytes.mockImplementation(async (r) => {
      if ((r as unknown as { fullPath: string }).fullPath.endsWith('_w320.jpg')) {
        throw new Error('quota');
      }
      return { ref: { fullPath: 'mock' } } as never;
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const file = new File(['fake'], 'test.jpg', { type: 'image/jpeg' });
    await expect(uploadGalleryPhoto({ scope: 'venues', entityId: 'x', file })).resolves.toBe(
      'https://storage.example/photo.jpg'
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
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
    // Legacy photo: no thumbnail to delete.
    expect(mockDeleteObject).toHaveBeenCalledTimes(1);
  });

  it('also deletes the thumbnail sibling of a _w1200 photo', async () => {
    const url = 'https://firebasestorage.googleapis.com/v0/b/bucket/o/venues%2Fc%2Fgallery%2F1-ab_w1200.jpg?alt=media&token=x';
    await deleteGalleryPhoto(url);
    expect(refPaths()).toEqual(
      expect.arrayContaining(['venues/c/gallery/1-ab_w1200.jpg', 'venues/c/gallery/1-ab_w320.jpg'])
    );
    expect(mockDeleteObject).toHaveBeenCalledTimes(2);
  });

  it('does not throw when URL is unparseable (best-effort delete)', async () => {
    await expect(deleteGalleryPhoto('not-a-firebase-url')).resolves.not.toThrow();
  });
});

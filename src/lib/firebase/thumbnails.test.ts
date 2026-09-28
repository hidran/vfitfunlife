import { describe, it, expect } from 'vitest';
import { isThumbnailPath, storagePathFromUrl, thumbnailPathFor, thumbnailUrl } from './thumbnails';

const BASE = 'https://firebasestorage.googleapis.com/v0/b/vfit-app-staging.firebasestorage.app/o/';

describe('thumbnailPathFor', () => {
  it('maps photo and avatar derivatives to their thumbnails', () => {
    expect(thumbnailPathFor('venues/a/gallery/1-x_w1200.jpg')).toBe('venues/a/gallery/1-x_w320.jpg');
    expect(thumbnailPathFor('profile-photos/u/1_w500.jpg')).toBe('profile-photos/u/1_w128.jpg');
  });

  it('returns null for legacy uploads without a size marker', () => {
    expect(thumbnailPathFor('venues/a/gallery/1-x.jpg')).toBeNull();
  });
});

describe('isThumbnailPath', () => {
  it('recognises thumbnails only', () => {
    expect(isThumbnailPath('portfolios/u/1_w320.jpg')).toBe(true);
    expect(isThumbnailPath('portfolios/u/1_w128.jpg')).toBe(true);
    expect(isThumbnailPath('portfolios/u/1_w1200.jpg')).toBe(false);
    expect(isThumbnailPath('portfolios/u/1.jpg')).toBe(false);
  });
});

describe('thumbnailUrl', () => {
  it('derives a token-less thumbnail URL in the same bucket', () => {
    const url = `${BASE}instructors%2Fp1%2Fgallery%2F17-ab_w1200.jpg?alt=media&token=abc`;
    expect(thumbnailUrl(url)).toBe(`${BASE}instructors%2Fp1%2Fgallery%2F17-ab_w320.jpg?alt=media`);
  });

  it('works for emulator URLs', () => {
    const url = 'http://localhost:9199/v0/b/demo/o/profile-photos%2Fu%2F1_w500.jpg?alt=media&token=t';
    expect(thumbnailUrl(url)).toBe(
      'http://localhost:9199/v0/b/demo/o/profile-photos%2Fu%2F1_w128.jpg?alt=media'
    );
  });

  it('returns legacy, foreign and empty URLs unchanged', () => {
    const legacy = `${BASE}venues%2Fa%2Fgallery%2F1.jpg?alt=media&token=abc`;
    expect(thumbnailUrl(legacy)).toBe(legacy);
    const foreign = 'https://images.unsplash.com/photo-1_w1200.jpg';
    expect(thumbnailUrl(foreign)).toBe(foreign);
    expect(thumbnailUrl(null)).toBeNull();
    expect(thumbnailUrl(undefined)).toBeUndefined();
  });
});

describe('storagePathFromUrl', () => {
  it('decodes the object path', () => {
    expect(storagePathFromUrl(`${BASE}a%2Fb%20c.jpg?alt=media`)).toBe('a/b c.jpg');
    expect(storagePathFromUrl('not a url')).toBeNull();
  });
});

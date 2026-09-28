/**
 * Client-side image derivatives (P2-10).
 *
 * Every upload stores the full-size derivative plus a small thumbnail next to it, and the
 * pair is linked by filename, not by a Firestore field:
 *
 *   venues/abc/gallery/1727000000000-x1y2z3_w1200.jpg   full   (≤1200px, photos)
 *   venues/abc/gallery/1727000000000-x1y2z3_w320.jpg    thumb  (≤320px)
 *   profile-photos/uid/1727000000000_w500.jpg           full   (≤500px, avatars)
 *   profile-photos/uid/1727000000000_w128.jpg           thumb  (≤128px)
 *
 * Photo arrays (venues.photoUrls, instructors.photoUrls, users.portfolioImages) and avatar
 * fields stay plain download-URL strings, so no schema change or migration is needed and
 * every existing reader keeps working. `thumbnailUrl()` derives the thumb URL from the full
 * one; legacy uploads (no `_w1200`/`_w500` marker) simply map to themselves.
 *
 * The derived URL is token-less (`?alt=media` only). That is valid because every path we
 * write thumbs to is `allow read: if true` in storage.rules; the thumb sits in the same
 * folder as its full image, so the same rule matches it.
 */

export interface DerivativeSpec {
  /** Max width/height of the full derivative. */
  full: number;
  /** Max width/height of the thumbnail. */
  thumb: number;
}

export const PHOTO_DERIVATIVES: DerivativeSpec = { full: 1200, thumb: 320 };
export const AVATAR_DERIVATIVES: DerivativeSpec = { full: 500, thumb: 128 };

const SPECS = [PHOTO_DERIVATIVES, AVATAR_DERIVATIVES];

/** `stem` → `{ full: "stem_w1200.jpg", thumb: "stem_w320.jpg" }`. */
export function derivativePaths(stem: string, spec: DerivativeSpec) {
  return { full: `${stem}_w${spec.full}.jpg`, thumb: `${stem}_w${spec.thumb}.jpg` };
}

/** Storage path of the thumbnail for a full-size path, or null for legacy/unknown paths. */
export function thumbnailPathFor(fullPath: string): string | null {
  for (const spec of SPECS) {
    const suffix = `_w${spec.full}.jpg`;
    if (fullPath.endsWith(suffix)) {
      return `${fullPath.slice(0, -suffix.length)}_w${spec.thumb}.jpg`;
    }
  }
  return null;
}

/** True for a thumbnail object (so listings of a folder can skip them). */
export function isThumbnailPath(path: string): boolean {
  return SPECS.some((spec) => path.endsWith(`_w${spec.thumb}.jpg`));
}

const DOWNLOAD_URL_RE = /^(https?:\/\/[^/]+(?:\/[^/]+)*?\/v0\/b\/[^/]+\/o\/)([^?#]+)/;

/** Storage object path encoded in a Firebase download URL, or null. */
export function storagePathFromUrl(url: string): string | null {
  const m = url.match(DOWNLOAD_URL_RE);
  if (!m) return null;
  try {
    return decodeURIComponent(m[2]);
  } catch {
    return null;
  }
}

/**
 * Thumbnail URL for a full-size download URL. Returns the input unchanged when the image
 * predates thumbnails (or isn't a Firebase Storage URL), so it is always safe to render.
 * Callers should still fall back to `url` on a load error (the thumb upload is best-effort).
 */
export function thumbnailUrl(url: string): string;
export function thumbnailUrl(url: string | null | undefined): string | null | undefined;
export function thumbnailUrl(url: string | null | undefined): string | null | undefined {
  if (!url) return url;
  const m = url.match(DOWNLOAD_URL_RE);
  if (!m) return url;
  let path: string;
  try {
    path = decodeURIComponent(m[2]);
  } catch {
    return url;
  }
  const thumbPath = thumbnailPathFor(path);
  if (!thumbPath) return url;
  return `${m[1]}${encodeURIComponent(thumbPath)}?alt=media`;
}

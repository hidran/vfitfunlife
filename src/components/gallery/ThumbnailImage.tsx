'use client';
import { useState } from 'react';
import { PHOTO_DERIVATIVES, thumbnailUrl } from '@/lib/firebase/thumbnails';

interface ThumbnailImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet'> {
  /** Full-size download URL, as stored in Firestore. */
  src: string;
  alt: string;
  /**
   * Rendered width hint. When given, the thumbnail and the full image are offered as a
   * srcset so high-DPR screens can still pick the sharp one; when omitted, the thumbnail
   * is used as-is (right for small tiles).
   */
  sizes?: string;
}

/**
 * <img> for grids and lists: loads the upload-time thumbnail (see lib/firebase/thumbnails)
 * and falls back to the full image when the photo predates thumbnails or the thumb is
 * missing. Lazy + async-decoded by default.
 */
export function ThumbnailImage({
  src,
  alt,
  sizes,
  loading = 'lazy',
  decoding = 'async',
  onError,
  ...rest
}: ThumbnailImageProps) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const thumb = thumbnailUrl(src);
  const hasThumb = thumb !== src && !thumbFailed;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...rest}
      src={hasThumb && !sizes ? thumb : src}
      srcSet={
        hasThumb && sizes
          ? `${thumb} ${PHOTO_DERIVATIVES.thumb}w, ${src} ${PHOTO_DERIVATIVES.full}w`
          : undefined
      }
      sizes={hasThumb ? sizes : undefined}
      alt={alt}
      loading={loading}
      decoding={decoding}
      onError={(e) => {
        if (hasThumb) setThumbFailed(true);
        else onError?.(e);
      }}
    />
  );
}

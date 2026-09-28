import { cn } from '@/lib/utils';
import { ThumbnailImage } from './ThumbnailImage';

interface PhotoCoverProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
  /** Rendered width, for picking thumbnail vs full image. Defaults to a full-width card. */
  sizes?: string;
}

/**
 * Single cover image for list cards. Renders the photo if present,
 * otherwise renders the fallback (typically a gradient block).
 */
export function PhotoCover({
  src,
  alt,
  className,
  fallback,
  sizes = '(max-width: 640px) 100vw, 640px',
}: PhotoCoverProps) {
  if (!src) {
    return <>{fallback}</>;
  }
  return (
    <div className={cn('relative h-full w-full overflow-hidden', className)}>
      <ThumbnailImage
        src={src}
        alt={alt}
        sizes={sizes}
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  );
}

import { cn } from '@/lib/utils';

interface PhotoCoverProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
}

/**
 * Single cover image for list cards. Renders the photo if present,
 * otherwise renders the fallback (typically a gradient block).
 */
export function PhotoCover({ src, alt, className, fallback }: PhotoCoverProps) {
  if (!src) {
    return <>{fallback}</>;
  }
  return (
    <div className={cn('relative h-full w-full overflow-hidden', className)}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  );
}

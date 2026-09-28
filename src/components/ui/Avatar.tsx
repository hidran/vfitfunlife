'use client';

import * as React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { thumbnailUrl } from '@/lib/firebase/thumbnails';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Image source URL */
  src?: string | null;
  /** Alt text for image */
  alt?: string;
  /** User name for initials fallback */
  name?: string;
  /** Avatar size */
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

/**
 * Get initials from a name
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Generate a consistent background color based on name
 */
function getColorFromName(name: string): string {
  // Each fill carries its own initials colour: the bright brand fills take
  // near-black ink (white on cyan/green/lime is ~1.3–2:1), only the deep blue
  // keeps white. Every pair clears WCAG AA 4.5:1.
  const colors = [
    'bg-[#00C9FF] text-black', // vfit cyan
    'bg-[#0066FF] text-white', // vfit blue
    'bg-[#7B61FF] text-black', // vfit purple
    'bg-[#B461FF] text-black', // vfun purple
    'bg-[#FF00E5] text-black', // vfun magenta
    'bg-[#00E676] text-black', // vlife green
    'bg-[#76FF03] text-black', // vlife lime
  ];

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length];
}

const sizeClasses = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-12 w-12 text-sm',
  lg: 'h-16 w-16 text-base',
  xl: 'h-24 w-24 text-xl',
};

const sizePixels = {
  sm: 32,
  md: 48,
  lg: 64,
  xl: 96,
} as const;

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, src, alt = '', name = '', size = 'md', ...props }, ref) => {
    const [imageError, setImageError] = React.useState(false);
    // Upload-time 128px thumbnail for sm/md/lg (<=64 CSS px, sharp up to 2x DPR); xl and
    // legacy uploads use the full image. A missing thumb falls back to the full image first.
    const [thumbFailed, setThumbFailed] = React.useState(false);
    const thumb = src && size !== 'xl' && !thumbFailed ? thumbnailUrl(src) : src;
    const usingThumb = !!thumb && thumb !== src;
    const showFallback = !src || imageError;
    const initials = name ? getInitials(name) : '?';
    const bgColor = name ? getColorFromName(name) : 'bg-[#6B7280] text-white';

    return (
      <div
        ref={ref}
        className={cn(
          'relative inline-flex items-center justify-center',
          'rounded-full overflow-hidden flex-shrink-0',
          sizeClasses[size],
          showFallback && bgColor,
          className
        )}
        {...props}
      >
        {!showFallback ? (
          <Image
            src={thumb as string}
            alt={alt || name}
            fill
            sizes={`${sizePixels[size]}px`}
            unoptimized
            className="h-full w-full object-cover"
            onError={() => (usingThumb ? setThumbFailed(true) : setImageError(true))}
          />
        ) : (
          <span
            className="font-semibold select-none"
            aria-label={name || 'User avatar'}
          >
            {initials}
          </span>
        )}
      </div>
    );
  }
);

Avatar.displayName = 'Avatar';

export interface AvatarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Maximum number of avatars to display before showing count */
  max?: number;
  /** Avatar size */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Children Avatar components */
  children: React.ReactNode;
}

const AvatarGroup = React.forwardRef<HTMLDivElement, AvatarGroupProps>(
  ({ className, max = 4, size = 'md', children, ...props }, ref) => {
    const childrenArray = React.Children.toArray(children);
    const visibleChildren = childrenArray.slice(0, max);
    const remainingCount = childrenArray.length - max;

    return (
      <div
        ref={ref}
        className={cn('flex -space-x-2', className)}
        {...props}
      >
        {visibleChildren.map((child, index) => (
          <div
            key={index}
            className="relative ring-2 ring-background-dark rounded-full"
            style={{ zIndex: visibleChildren.length - index }}
          >
            {React.isValidElement(child)
              ? React.cloneElement(child as React.ReactElement<AvatarProps>, { size })
              : child}
          </div>
        ))}
        {remainingCount > 0 && (
          <div
            className={cn(
              'relative inline-flex items-center justify-center',
              'rounded-full bg-surface-elevated ring-2 ring-background-dark',
              'text-content-muted font-medium',
              sizeClasses[size]
            )}
            style={{ zIndex: 0 }}
          >
            +{remainingCount}
          </div>
        )}
      </div>
    );
  }
);

AvatarGroup.displayName = 'AvatarGroup';

export { Avatar, AvatarGroup };

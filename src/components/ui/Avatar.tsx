'use client';

import * as React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

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
  const colors = [
    'bg-[#00C9FF]', // vfit cyan
    'bg-[#0066FF]', // vfit blue
    'bg-[#7B61FF]', // vfit purple
    'bg-[#B461FF]', // vfun purple
    'bg-[#FF00E5]', // vfun magenta
    'bg-[#00E676]', // vlife green
    'bg-[#76FF03]', // vlife lime
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
    const showFallback = !src || imageError;
    const initials = name ? getInitials(name) : '?';
    const bgColor = name ? getColorFromName(name) : 'bg-[#6B7280]';

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
            src={src}
            alt={alt || name}
            fill
            sizes={`${sizePixels[size]}px`}
            unoptimized
            className="h-full w-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <span
            className="font-semibold text-white select-none"
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
            className="relative ring-2 ring-white rounded-full"
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
              'rounded-full bg-[#F3F4F6] ring-2 ring-white',
              'text-[#6B7280] font-medium',
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

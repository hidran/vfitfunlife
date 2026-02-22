'use client';

import * as React from 'react';
import Image, { type ImageProps } from 'next/image';
import { cn } from '@/lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Enable hover effect with shadow */
  hoverable?: boolean;
  /** Card padding preset */
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, hoverable = false, padding = 'none', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          // Base styles
          'bg-white rounded-xl overflow-hidden',
          'border border-[var(--section-primary,#E5E7EB)]/20',
          'shadow-md',
          // Hover effect
          hoverable && [
            'transition-all duration-200 ease-out',
            'hover:-translate-y-1 hover:shadow-xl',
            'cursor-pointer',
          ],
          // Padding
          padding === 'sm' && 'p-3',
          padding === 'md' && 'p-4',
          padding === 'lg' && 'p-6',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

export interface CardImageProps extends Omit<ImageProps, 'width' | 'height' | 'alt'> {
  /** Aspect ratio preset */
  aspectRatio?: '16/9' | '4/3' | '1/1' | 'auto';
  alt?: string;
}

const CardImage = ({
  className,
  aspectRatio = '16/9',
  alt = '',
  unoptimized = true,
  ...props
}: CardImageProps) => {
  const dimensions =
    aspectRatio === '4/3'
      ? { width: 800, height: 600 }
      : aspectRatio === '1/1'
        ? { width: 800, height: 800 }
        : aspectRatio === 'auto'
          ? { width: 1200, height: 800 }
          : { width: 1280, height: 720 };

  return (
    <Image
      className={cn(
        'w-full object-cover',
        aspectRatio === '16/9' && 'aspect-video',
        aspectRatio === '4/3' && 'aspect-[4/3]',
        aspectRatio === '1/1' && 'aspect-square',
        className
      )}
      alt={alt}
      unoptimized={unoptimized}
      width={dimensions.width}
      height={dimensions.height}
      {...props}
    />
  );
};

CardImage.displayName = 'CardImage';

export interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {}

const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('p-4', className)}
        {...props}
      />
    );
  }
);

CardContent.displayName = 'CardContent';

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('p-4 pb-0', className)}
        {...props}
      />
    );
  }
);

CardHeader.displayName = 'CardHeader';

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}

const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className, ...props }, ref) => {
    return (
      <h3
        ref={ref}
        className={cn(
          'text-xl font-semibold text-[#1A1D29] leading-tight',
          className
        )}
        {...props}
      />
    );
  }
);

CardTitle.displayName = 'CardTitle';

export interface CardDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

const CardDescription = React.forwardRef<HTMLParagraphElement, CardDescriptionProps>(
  ({ className, ...props }, ref) => {
    return (
      <p
        ref={ref}
        className={cn('text-sm text-[#6B7280] mt-1', className)}
        {...props}
      />
    );
  }
);

CardDescription.displayName = 'CardDescription';

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('p-4 pt-0 flex items-center', className)}
        {...props}
      />
    );
  }
);

CardFooter.displayName = 'CardFooter';

export { Card, CardImage, CardContent, CardHeader, CardTitle, CardDescription, CardFooter };

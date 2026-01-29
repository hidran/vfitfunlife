'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Spinner size */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Use section gradient colors */
  gradient?: boolean;
}

const sizeClasses = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-3',
  xl: 'h-12 w-12 border-4',
};

const Spinner = React.forwardRef<HTMLDivElement, SpinnerProps>(
  ({ className, size = 'md', gradient = true, ...props }, ref) => {
    if (gradient) {
      return (
        <div
          ref={ref}
          role="status"
          aria-label="Loading"
          className={cn('relative', className)}
          {...props}
        >
          <svg
            className={cn(
              'animate-spin',
              size === 'sm' && 'h-4 w-4',
              size === 'md' && 'h-6 w-6',
              size === 'lg' && 'h-8 w-8',
              size === 'xl' && 'h-12 w-12'
            )}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient
                id="spinner-gradient"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop
                  offset="0%"
                  stopColor="var(--section-primary, #00C9FF)"
                />
                <stop
                  offset="50%"
                  stopColor="var(--section-secondary, #0066FF)"
                />
                <stop
                  offset="100%"
                  stopColor="var(--section-accent, #7B61FF)"
                />
              </linearGradient>
            </defs>
            <circle
              className="opacity-20"
              cx="12"
              cy="12"
              r="10"
              stroke="url(#spinner-gradient)"
              strokeWidth={size === 'xl' ? 4 : size === 'lg' ? 3 : 2}
            />
            <path
              d="M12 2a10 10 0 0 1 10 10"
              stroke="url(#spinner-gradient)"
              strokeWidth={size === 'xl' ? 4 : size === 'lg' ? 3 : 2}
              strokeLinecap="round"
            />
          </svg>
          <span className="sr-only">Loading...</span>
        </div>
      );
    }

    return (
      <div
        ref={ref}
        role="status"
        aria-label="Loading"
        className={cn(
          'animate-spin rounded-full',
          'border-[var(--section-primary,#00C9FF)]',
          'border-t-transparent',
          sizeClasses[size],
          className
        )}
        {...props}
      >
        <span className="sr-only">Loading...</span>
      </div>
    );
  }
);

Spinner.displayName = 'Spinner';

export { Spinner };

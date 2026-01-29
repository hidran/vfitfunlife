'use client';

import * as React from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** The icon component to render */
  icon: LucideIcon;
  /** Button variant style */
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  /** Button size */
  size?: 'sm' | 'md' | 'lg';
  /** Show loading spinner */
  loading?: boolean;
  /** Accessible label (required for icon-only buttons) */
  'aria-label': string;
}

const sizeConfig = {
  sm: { button: 'h-9 w-9', icon: 16 },
  md: { button: 'h-11 w-11', icon: 20 },
  lg: { button: 'h-14 w-14', icon: 24 },
};

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      className,
      icon: Icon,
      variant = 'ghost',
      size = 'md',
      loading = false,
      disabled,
      'aria-label': ariaLabel,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;
    const config = sizeConfig[size];

    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          // Base styles - ensures 44x44px minimum touch target
          'inline-flex items-center justify-center flex-shrink-0',
          'min-h-[44px] min-w-[44px]',
          'rounded-full transition-all duration-200 ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          // Size
          config.button,
          // Variant styles
          variant === 'primary' && [
            'bg-[var(--section-primary,#00C9FF)] text-white',
            'shadow-md hover:shadow-lg hover:scale-105',
            'active:shadow-sm active:scale-100',
            'focus-visible:ring-[var(--section-primary,#00C9FF)]',
          ],
          variant === 'secondary' && [
            'bg-[var(--section-primary,#00C9FF)]/10 text-[var(--section-primary,#00C9FF)]',
            'hover:bg-[var(--section-primary,#00C9FF)]/20',
            'focus-visible:ring-[var(--section-primary,#00C9FF)]',
          ],
          variant === 'ghost' && [
            'bg-transparent text-[#6B7280]',
            'hover:bg-gray-100 hover:text-[#1A1D29]',
            'focus-visible:ring-gray-400',
          ],
          variant === 'outline' && [
            'bg-transparent text-[var(--section-primary,#00C9FF)]',
            'border-2 border-[var(--section-primary,#00C9FF)]',
            'hover:bg-[var(--section-primary,#00C9FF)]/10',
            'focus-visible:ring-[var(--section-primary,#00C9FF)]',
          ],
          className
        )}
        disabled={isDisabled}
        aria-label={ariaLabel}
        {...props}
      >
        {loading ? (
          <Loader2
            size={config.icon}
            className="animate-spin"
            aria-hidden="true"
          />
        ) : (
          <Icon size={config.icon} aria-hidden="true" />
        )}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';

export { IconButton };

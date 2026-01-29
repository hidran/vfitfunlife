'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Badge variant */
  variant?: 'vip' | 'partner' | 'success' | 'warning' | 'error' | 'info' | 'default';
  /** Badge size */
  size?: 'sm' | 'md';
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', size = 'md', ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          // Base styles
          'inline-flex items-center justify-center font-semibold',
          'rounded-full uppercase tracking-wide whitespace-nowrap',
          // Size
          size === 'sm' && 'px-2 py-0.5 text-[10px]',
          size === 'md' && 'px-3 py-1 text-xs',
          // Variant styles
          variant === 'vip' && [
            'bg-[#FFF9E6] text-[#B8860B]',
            'border border-[#FFD700]/30',
          ],
          variant === 'partner' && [
            'bg-[#DBEAFE] text-[#3B82F6]',
            'border border-[#3B82F6]/30',
          ],
          variant === 'success' && [
            'bg-[#D1FAE5] text-[#059669]',
            'border border-[#10B981]/30',
          ],
          variant === 'warning' && [
            'bg-[#FEF3C7] text-[#D97706]',
            'border border-[#F59E0B]/30',
          ],
          variant === 'error' && [
            'bg-[#FEE2E2] text-[#DC2626]',
            'border border-[#EF4444]/30',
          ],
          variant === 'info' && [
            'bg-[#DBEAFE] text-[#2563EB]',
            'border border-[#3B82F6]/30',
          ],
          variant === 'default' && [
            'bg-[#F3F4F6] text-[#6B7280]',
            'border border-[#E5E7EB]',
          ],
          className
        )}
        {...props}
      />
    );
  }
);

Badge.displayName = 'Badge';

export { Badge };

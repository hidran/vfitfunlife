'use client';

import * as React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';

export interface RatingProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Rating value (0-5) */
  value: number;
  /** Number of reviews/ratings count */
  count?: number;
  /** Size of stars */
  size?: 'sm' | 'md' | 'lg';
  /** Show numeric value */
  showValue?: boolean;
  /** Show count */
  showCount?: boolean;
}

const sizeConfig = {
  sm: { star: 14, text: 'text-xs', gap: 'gap-0.5' },
  md: { star: 18, text: 'text-sm', gap: 'gap-1' },
  lg: { star: 22, text: 'text-base', gap: 'gap-1.5' },
};

const Rating = React.forwardRef<HTMLDivElement, RatingProps>(
  (
    {
      className,
      value,
      count,
      size = 'md',
      showValue = true,
      showCount = true,
      ...props
    },
    ref
  ) => {
    const { t } = useI18n();
    const config = sizeConfig[size];
    const clampedValue = Math.max(0, Math.min(5, value));
    const fullStars = Math.floor(clampedValue);
    const hasHalfStar = clampedValue % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    const ariaLabel =
      typeof count === 'number'
        ? t('ui.rating.ariaLabelWithCount', { value: value.toFixed(1), count })
        : t('ui.rating.ariaLabel', { value: value.toFixed(1) });

    return (
      <div
        ref={ref}
        className={cn('inline-flex items-center', config.gap, className)}
        aria-label={ariaLabel}
        {...props}
      >
        {/* Stars */}
        <div className={cn('flex items-center', config.gap)}>
          {/* Full stars */}
          {Array.from({ length: fullStars }).map((_, i) => (
            <Star
              key={`full-${i}`}
              size={config.star}
              className="fill-[#FFD700] text-[#FFD700]"
              aria-hidden="true"
            />
          ))}

          {/* Half star */}
          {hasHalfStar && (
            <div className="relative" aria-hidden="true">
              <Star
                size={config.star}
                className="text-[#E5E7EB]"
              />
              <div className="absolute inset-0 overflow-hidden w-1/2">
                <Star
                  size={config.star}
                  className="fill-[#FFD700] text-[#FFD700]"
                />
              </div>
            </div>
          )}

          {/* Empty stars */}
          {Array.from({ length: emptyStars }).map((_, i) => (
            <Star
              key={`empty-${i}`}
              size={config.star}
              className="text-[#E5E7EB]"
              aria-hidden="true"
            />
          ))}
        </div>

        {/* Value */}
        {showValue && (
          <span className={cn('font-semibold text-[#1A1D29]', config.text)}>
            {value.toFixed(1)}
          </span>
        )}

        {/* Count */}
        {showCount && typeof count === 'number' && (
          <span className={cn('text-[#6B7280]', config.text)}>
            ({count.toLocaleString()})
          </span>
        )}
      </div>
    );
  }
);

Rating.displayName = 'Rating';

export { Rating };

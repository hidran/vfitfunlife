'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ServiceCategoryCardProps {
  name: string;
  icon: ReactNode;
  onClick?: () => void;
  isActive?: boolean;
  variant?: 'default' | 'compact';
  className?: string;
}

export function ServiceCategoryCard({
  name,
  icon,
  onClick,
  isActive = false,
  variant = 'default',
  className,
}: ServiceCategoryCardProps) {
  const isCompact = variant === 'compact';

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center transition-all duration-200 touch-target',
        'rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10',
        'active:scale-[0.97]',
        isActive && 'border-vlife-primary bg-vlife-primary/10',
        isCompact ? 'p-3 gap-2' : 'p-4 gap-3',
        className
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-xl',
          isCompact ? 'w-10 h-10' : 'w-12 h-12',
          'bg-gradient-to-br from-vlife-primary/20 to-vlife-secondary/20'
        )}
      >
        <span
          className={cn(
            'text-vlife-primary',
            isCompact ? 'text-lg' : 'text-xl'
          )}
        >
          {icon}
        </span>
      </div>
      <span
        className={cn(
          'font-medium text-text-inverse text-center leading-tight',
          isCompact ? 'text-xs' : 'text-sm'
        )}
      >
        {name}
      </span>
    </button>
  );
}

export default ServiceCategoryCard;

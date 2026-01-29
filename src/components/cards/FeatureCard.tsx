'use client';

import { type ReactNode } from 'react';
import Image from 'next/image';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FeatureCardProps {
  title: string;
  subtitle?: string;
  description?: string;
  image: string;
  price?: number;
  duration?: number;
  badges?: string[];
  icon?: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'horizontal' | 'hero';
  className?: string;
}

export function FeatureCard({
  title,
  subtitle,
  description,
  image,
  price,
  duration,
  badges = [],
  icon,
  onClick,
  variant = 'default',
  className,
}: FeatureCardProps) {
  if (variant === 'horizontal') {
    return (
      <button
        onClick={onClick}
        className={cn(
          'flex items-center gap-4 p-4 rounded-2xl w-full text-left',
          'bg-white/5 border border-white/10 hover:bg-white/10',
          'transition-all duration-200 active:scale-[0.98]',
          className
        )}
      >
        <div className="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0">
          <Image
            src={image}
            alt={title}
            fill
            className="object-cover"
          />
          {icon && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <span className="text-vlife-primary">{icon}</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-text-inverse text-base truncate">
            {title}
          </h4>
          {subtitle && (
            <p className="text-vlife-primary text-sm font-medium mt-0.5">
              {subtitle}
            </p>
          )}
          {description && (
            <p className="text-text-tertiary text-sm mt-1 line-clamp-2">
              {description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2">
            {price !== undefined && (
              <span className="text-text-inverse font-semibold">
                {price.toFixed(0)}
              </span>
            )}
            {duration && (
              <span className="text-text-tertiary text-xs">
                {duration} min
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-text-tertiary flex-shrink-0" />
      </button>
    );
  }

  if (variant === 'hero') {
    return (
      <button
        onClick={onClick}
        className={cn(
          'relative w-full rounded-2xl overflow-hidden',
          'transition-all duration-200 active:scale-[0.99]',
          className
        )}
      >
        {/* Background Image */}
        <div className="relative h-56">
          <Image
            src={image}
            alt={title}
            fill
            className="object-cover"
          />
          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

          {/* Badges */}
          {badges.length > 0 && (
            <div className="absolute top-4 left-4 flex gap-2">
              {badges.map((badge, index) => (
                <span
                  key={index}
                  className="px-3 py-1 rounded-full text-xs font-semibold bg-vlife-primary text-black"
                >
                  {badge}
                </span>
              ))}
            </div>
          )}

          {/* Content */}
          <div className="absolute bottom-0 left-0 right-0 p-5">
            {icon && (
              <div className="w-12 h-12 rounded-xl bg-vlife-primary/20 flex items-center justify-center mb-3">
                <span className="text-vlife-primary">{icon}</span>
              </div>
            )}
            <h3 className="font-bold text-text-inverse text-xl mb-1">
              {title}
            </h3>
            {subtitle && (
              <p className="text-vlife-primary text-sm font-medium mb-2">
                {subtitle}
              </p>
            )}
            {description && (
              <p className="text-text-inverse/80 text-sm line-clamp-2">
                {description}
              </p>
            )}
            <div className="flex items-center gap-4 mt-3">
              {price !== undefined && (
                <span className="text-vlife-secondary font-bold text-lg">
                  {price.toFixed(0)}
                </span>
              )}
              {duration && (
                <span className="text-text-tertiary text-sm">
                  {duration} min
                </span>
              )}
            </div>
          </div>
        </div>
      </button>
    );
  }

  // Default variant
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col rounded-2xl overflow-hidden w-full',
        'bg-white/5 border border-white/10 hover:bg-white/10',
        'transition-all duration-200 active:scale-[0.98]',
        className
      )}
    >
      <div className="relative h-36">
        <Image
          src={image}
          alt={title}
          fill
          className="object-cover"
        />
        {badges.length > 0 && (
          <div className="absolute top-3 left-3 flex gap-2">
            {badges.map((badge, index) => (
              <span
                key={index}
                className="px-2 py-0.5 rounded-full text-xs font-semibold bg-vlife-primary text-black"
              >
                {badge}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="p-4 text-left">
        <h4 className="font-semibold text-text-inverse text-sm truncate">
          {title}
        </h4>
        {subtitle && (
          <p className="text-vlife-primary text-xs font-medium mt-0.5">
            {subtitle}
          </p>
        )}
        {description && (
          <p className="text-text-tertiary text-xs mt-1 line-clamp-2">
            {description}
          </p>
        )}
        <div className="flex items-center gap-3 mt-2">
          {price !== undefined && (
            <span className="text-text-inverse font-semibold text-sm">
              {price.toFixed(0)}
            </span>
          )}
          {duration && (
            <span className="text-text-tertiary text-xs">
              {duration} min
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export default FeatureCard;

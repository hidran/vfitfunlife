'use client';

import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: number;
  trendLabel?: string;
  className?: string;
  onClick?: () => void;
}

export function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  trendLabel,
  className,
  onClick,
}: StatCardProps) {
  const isPositive = trend && trend > 0;
  const isNegative = trend && trend < 0;

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-[#2A2D3A] rounded-xl p-5 border border-white/5',
        'transition-all duration-200',
        onClick && 'cursor-pointer hover:bg-[#3A3D4A] hover:border-white/10',
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-400 mb-1">{title}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
          
          {trend !== undefined && (
            <div className="flex items-center gap-1 mt-2">
              {isPositive ? (
                <TrendingUp className="w-4 h-4 text-green-400" />
              ) : isNegative ? (
                <TrendingDown className="w-4 h-4 text-red-400" />
              ) : null}
              <span
                className={cn(
                  'text-xs font-medium',
                  isPositive && 'text-green-400',
                  isNegative && 'text-red-400',
                  !isPositive && !isNegative && 'text-gray-400'
                )}
              >
                {isPositive ? '+' : ''}{trend}%
              </span>
              {trendLabel && (
                <span className="text-xs text-gray-500">{trendLabel}</span>
              )}
            </div>
          )}
        </div>
        
        <div className="p-3 bg-section-gradient rounded-lg">
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  );
}

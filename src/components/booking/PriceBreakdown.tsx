'use client';

import React from 'react';
import { Tag, Ticket, Coins } from 'lucide-react';
import { cn, formatPrice } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';

interface PriceBreakdownProps {
  servicePrice: number;
  platformFee?: number;
  discountAmount?: number;
  pointsUsed?: number;
  pointsValue?: number;
  totalPrice: number;
  className?: string;
}

export function PriceBreakdown({
  servicePrice,
  platformFee = 0,
  discountAmount = 0,
  pointsUsed = 0,
  pointsValue = 0,
  totalPrice,
  className,
}: PriceBreakdownProps) {
  const { t } = useI18n();
  const subtotal = servicePrice + platformFee;
  const hasDiscount = discountAmount > 0;
  const hasPoints = pointsUsed > 0;

  return (
    <div className={cn('bg-[#2A2D3A]/50 rounded-2xl p-4', className)}>
      <h3 className="font-semibold text-white mb-4">{t('booking.price.summary')}</h3>

      <div className="space-y-3">
        {/* Service price */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">{t('booking.price.service')}</span>
          <span className="text-white">{formatPrice(servicePrice)}</span>
        </div>

        {/* Platform fee */}
        {platformFee > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5" />
              {t('booking.price.platformFee')}
            </span>
            <span className="text-white">{formatPrice(platformFee)}</span>
          </div>
        )}

        {/* Subtotal */}
        <div className="flex items-center justify-between text-sm pt-2 border-t border-white/10">
          <span className="text-text-secondary">{t('booking.price.subtotal')}</span>
          <span className="text-white">{formatPrice(subtotal)}</span>
        </div>

        {/* Discount */}
        {hasDiscount && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-success flex items-center gap-1.5">
              <Ticket className="w-3.5 h-3.5" />
              {t('booking.price.discount')}
            </span>
            <span className="text-success">-{formatPrice(discountAmount)}</span>
          </div>
        )}

        {/* Points */}
        {hasPoints && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--section-accent)] flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5" />
              {t('booking.price.pointsUsed', { count: pointsUsed.toLocaleString() })}
            </span>
            <span className="text-[var(--section-accent)]">-{formatPrice(pointsValue)}</span>
          </div>
        )}

        {/* Total */}
        <div className="flex items-center justify-between pt-3 border-t border-white/10">
          <span className="font-semibold text-white">{t('common.total')}</span>
          <span className="text-xl font-bold text-[var(--section-primary)]">
            {formatPrice(totalPrice)}
          </span>
        </div>

        {/* Savings notice */}
        {(hasDiscount || hasPoints) && (
          <div className="text-center pt-2">
            <span className="text-xs text-success bg-success/10 px-3 py-1 rounded-full">
              {t('booking.price.savings', { amount: formatPrice(discountAmount + pointsValue) })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

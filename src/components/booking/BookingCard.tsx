'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  Clock,
  MapPin,
  ChevronRight,
  Star,
  X,
  RotateCcw,
} from 'lucide-react';
import { cn, formatPrice } from '@/lib/utils';
import { getBookingSectionMeta } from '@/lib/bookingUtils';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';
// IconButton component is used below
import {
  BOOKING_STATUS_META,
  canClientCancel,
  canReschedule as canRescheduleBooking,
  canReview as canReviewBooking,
} from '@/lib/bookingStatus';
import type { Booking } from '@/types/booking';

interface BookingCardProps {
  booking: Booking;
  onCancel?: (id: string) => void;
  onReschedule?: (id: string) => void;
  onReview?: (id: string) => void;
  compact?: boolean;
  className?: string;
}


export function BookingCard({
  booking,
  onCancel,
  onReschedule,
  onReview,
  compact = false,
  className,
}: BookingCardProps) {
  const router = useRouter();
  const { t, locale } = useI18n();

  const statusMeta = BOOKING_STATUS_META[booking.status];
  const statusVariant = statusMeta.tone;
  const statusLabel = t(statusMeta.labelKey);
  const sectionMeta = getBookingSectionMeta(booking.serviceName);

  const scheduledAt = booking.scheduledAt.toDate();
  const isPast = scheduledAt < new Date();
  const canCancel = canClientCancel(booking.status);
  const canReschedule = canRescheduleBooking(booking.status, isPast);
  const canReview = canReviewBooking(booking.status, booking.hasReviewed);

  if (compact) {
    return (
      <button
        onClick={() => router.push(`/bookings/${booking.id}`)}
        className={cn(
          'group relative w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 text-left',
          'hover:bg-white/10 transition-colors',
          className
        )}
      >
        <div
          className="absolute left-0 top-0 h-full w-1.5"
          style={{ backgroundColor: sectionMeta.color }}
        />

        <div className="flex flex-1 items-start gap-3 pl-2">
          <Avatar
            src={booking.providerAvatar}
            alt={booking.providerName}
            size="md"
            className="shrink-0"
          />

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{
                  color: sectionMeta.color,
                  backgroundColor: sectionMeta.softColor,
                }}
              >
                {sectionMeta.label}
              </span>
              <Badge variant={statusVariant} size="sm">
                {statusLabel}
              </Badge>
            </div>

            <h3 className="truncate font-semibold text-white">
              {booking.serviceName}
            </h3>
            <p className="truncate text-sm text-text-secondary">{booking.providerName}</p>

            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {scheduledAt.toLocaleDateString(toLocaleTag(locale), {
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {scheduledAt.toLocaleTimeString(toLocaleTag(locale), {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              {booking.location?.address && (
                <span className="flex items-center gap-1 truncate">
                  <MapPin className="h-3 w-3" />
                  <span className="truncate">{booking.location.address}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        <ChevronRight className="h-5 w-5 shrink-0 text-text-tertiary group-hover:text-white" />
      </button>
    );
  }

  return (
    <div
      className={cn(
        'bg-surface-elevated/50 rounded-2xl overflow-hidden',
        className
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar
              src={booking.providerAvatar}
              alt={booking.providerName}
              size="lg"
            />
            <div>
              <h3 className="font-semibold text-white">{booking.providerName}</h3>
              <p className="text-sm text-text-secondary">{booking.serviceName}</p>
            </div>
          </div>

          <Badge variant={statusVariant}>{statusLabel}</Badge>
        </div>
      </div>

      {/* Details */}
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3 text-sm">
          <Calendar className="w-4 h-4 text-[var(--section-primary)]" />
          <span className="text-white">
            {scheduledAt.toLocaleDateString(toLocaleTag(locale), {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </span>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <Clock className="w-4 h-4 text-[var(--section-primary)]" />
          <span className="text-white">
            {scheduledAt.toLocaleTimeString(toLocaleTag(locale), {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {' '}&middot;{' '}
            {booking.duration} min
          </span>
        </div>

        {booking.location?.address && (
          <div className="flex items-center gap-3 text-sm">
            <MapPin className="w-4 h-4 text-[var(--section-primary)]" />
            <span className="text-text-secondary truncate">
              {booking.location.address}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-white/10">
          <span className="text-text-secondary">{t('booking.card.total')}</span>
          <span className="text-lg font-bold text-white">
            {formatPrice(booking.totalPrice)}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 pt-0 flex gap-2">
        {canReview && (
          <button
            onClick={() => onReview?.(booking.id)}
            className="flex-1 bg-[var(--section-primary)]/20 text-[var(--section-primary)] py-2.5 rounded-xl font-medium text-sm hover:bg-[var(--section-primary)]/30 transition-colors flex items-center justify-center gap-2"
          >
            <Star className="w-4 h-4" />
            {t('booking.card.leaveReview')}
          </button>
        )}

        {canReschedule && (
          <button
            onClick={() => onReschedule?.(booking.id)}
            className="flex-1 bg-white/10 text-white py-2.5 rounded-xl font-medium text-sm hover:bg-white/20 transition-colors flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            {t('booking.card.reschedule')}
          </button>
        )}

        {canCancel && (
          <button
            onClick={() => onCancel?.(booking.id)}
            className="p-2 rounded-lg text-error hover:bg-error/10 transition-colors"
            aria-label={t('booking.card.cancelAriaLabel')}
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={() => router.push(`/bookings/${booking.id}`)}
          className="flex-1 bg-white/10 text-white py-2.5 rounded-xl font-medium text-sm hover:bg-white/20 transition-colors flex items-center justify-center gap-2"
        >
          {t('booking.card.details')}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

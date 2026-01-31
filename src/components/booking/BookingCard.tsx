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
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
// IconButton component is used below
import type { Booking, BookingStatus } from '@/types/booking';

interface BookingCardProps {
  booking: Booking;
  onCancel?: (id: string) => void;
  onReschedule?: (id: string) => void;
  onReview?: (id: string) => void;
  compact?: boolean;
  className?: string;
}

const statusConfig: Record<BookingStatus, { label: string; variant: any }> = {
  pending: { label: 'In attesa', variant: 'warning' },
  confirmed: { label: 'Confermato', variant: 'success' },
  in_progress: { label: 'In corso', variant: 'info' },
  completed: { label: 'Completato', variant: 'default' },
  cancelled: { label: 'Annullato', variant: 'error' },
  no_show: { label: 'No show', variant: 'error' },
};

export function BookingCard({
  booking,
  onCancel,
  onReschedule,
  onReview,
  compact = false,
  className,
}: BookingCardProps) {
  const router = useRouter();
  const status = statusConfig[booking.status];
  
  const scheduledAt = booking.scheduledAt.toDate();
  const isPast = scheduledAt < new Date();
  const canCancel = booking.status === 'confirmed' || booking.status === 'pending';
  const canReschedule = booking.status === 'confirmed' && !isPast;
  const canReview = booking.status === 'completed' && !booking.hasReviewed;

  if (compact) {
    return (
      <button
        onClick={() => router.push(`/bookings/${booking.id}`)}
        className={cn(
          'w-full bg-[#2A2D3A]/50 rounded-xl p-4 flex items-center gap-4',
          'hover:bg-[#2A2D3A] transition-colors text-left',
          className
        )}
      >
        <Avatar
          src={booking.providerAvatar}
          alt={booking.providerName}
          size="md"
        />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-white truncate">
              {booking.serviceName}
            </h3>
            <Badge variant={status.variant} size="sm">
              {status.label}
            </Badge>
          </div>
          
          <p className="text-sm text-text-secondary truncate">
            {booking.providerName}
          </p>
          
          <div className="flex items-center gap-3 mt-1.5 text-xs text-text-tertiary">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {scheduledAt.toLocaleDateString('it-IT', {
                day: 'numeric',
                month: 'short',
              })}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {scheduledAt.toLocaleTimeString('it-IT', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>

        <ChevronRight className="w-5 h-5 text-text-tertiary flex-shrink-0" />
      </button>
    );
  }

  return (
    <div
      className={cn(
        'bg-[#2A2D3A]/50 rounded-2xl overflow-hidden',
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
          
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
      </div>

      {/* Details */}
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3 text-sm">
          <Calendar className="w-4 h-4 text-[var(--section-primary)]" />
          <span className="text-white">
            {scheduledAt.toLocaleDateString('it-IT', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </span>
        </div>
        
        <div className="flex items-center gap-3 text-sm">
          <Clock className="w-4 h-4 text-[var(--section-primary)]" />
          <span className="text-white">
            {scheduledAt.toLocaleTimeString('it-IT', {
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
          <span className="text-text-secondary">Totale</span>
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
            Lascia recensione
          </button>
        )}
        
        {canReschedule && (
          <button
            onClick={() => onReschedule?.(booking.id)}
            className="flex-1 bg-white/10 text-white py-2.5 rounded-xl font-medium text-sm hover:bg-white/20 transition-colors flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Riprogramma
          </button>
        )}
        
        {canCancel && (
          <button
            onClick={() => onCancel?.(booking.id)}
            className="p-2 rounded-lg text-error hover:bg-error/10 transition-colors"
            aria-label="Annulla"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        
        <button
          onClick={() => router.push(`/bookings/${booking.id}`)}
          className="flex-1 bg-white/10 text-white py-2.5 rounded-xl font-medium text-sm hover:bg-white/20 transition-colors flex items-center justify-center gap-2"
        >
          Dettagli
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

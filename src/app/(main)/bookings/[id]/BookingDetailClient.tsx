'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft,
  Calendar,
  Clock,
  MapPin,
  MessageCircle,
  Star,
  X,
  RotateCcw,
  Share2,
  Download,
  CheckCircle,
  AlertCircle,
  Copy,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn, formatPrice } from '@/lib/utils';
import { buildFallbackBooking } from '@/lib/bookingUtils';
import { useBookingStore } from '@/stores/bookingStore';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { GoogleMap } from '@/components/map/GoogleMap';
import type { Booking, BookingStatus } from '@/types/booking';

const statusConfig: Record<
  BookingStatus,
  { labelKey: string; variant: BadgeProps['variant']; icon: LucideIcon }
> = {
  pending: { labelKey: 'booking.status.pending', variant: 'warning', icon: AlertCircle },
  confirmed: { labelKey: 'booking.status.confirmed', variant: 'success', icon: CheckCircle },
  in_progress: { labelKey: 'booking.status.inProgress', variant: 'info', icon: Clock },
  completed: { labelKey: 'booking.status.completed', variant: 'default', icon: CheckCircle },
  cancelled: { labelKey: 'booking.status.cancelled', variant: 'error', icon: X },
  no_show: { labelKey: 'booking.status.noShow', variant: 'error', icon: AlertCircle },
};

export default function BookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, locale } = useI18n();
  const bookingId = params.id as string;
  const justConfirmed = searchParams.get('confirmed') === 'true';
  const justRescheduled = searchParams.get('rescheduled') === 'true';
  const justReviewed = searchParams.get('reviewed') === 'true';

  const {
    cancelBooking,
    userBookings,
    currentBooking,
    updateBookingInList,
    updateCurrentBooking,
  } = useBookingStore();
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [localBookingOverride, setLocalBookingOverride] = useState<Booking | null>(null);

  const storeBooking = useMemo(() => {
    return (
      userBookings.find((entry) => entry.id === bookingId) ||
      (currentBooking?.id === bookingId ? currentBooking : null)
    );
  }, [bookingId, currentBooking, userBookings]);

  const booking = localBookingOverride ?? storeBooking ?? buildFallbackBooking(bookingId);
  const isFallbackBooking = !localBookingOverride && !storeBooking;

  const qrCells = useMemo(() => {
    const source = `${booking.id}-${booking.providerId ?? ''}-${booking.scheduledAt.toDate().toISOString()}`;
    const values = source.split('').map((char) => char.charCodeAt(0));

    return Array.from({ length: 21 * 21 }, (_, index) => {
      const seed = values[index % values.length] ?? 0;
      return ((seed + index * 13) % 4) <= 1;
    });
  }, [booking.id, booking.providerId, booking.scheduledAt]);

  const handleCancel = async () => {
    try {
      if (isFallbackBooking) {
        setLocalBookingOverride({
          ...booking,
          status: 'cancelled',
          cancellationReason: "Annullato dall'utente",
        });
        setShowCancelModal(false);
        return;
      }

      await cancelBooking(bookingId, "Annullato dall'utente");
      const cancelledBooking = {
        ...booking,
        status: 'cancelled' as const,
        cancellationReason: "Annullato dall'utente",
      };
      updateBookingInList(cancelledBooking);
      updateCurrentBooking(cancelledBooking);
      setShowCancelModal(false);
    } catch {
      alert(t('bookings.detail.errorCancel'));
    }
  };

  const handleAddToCalendar = () => {
    if (!booking) return;

    const start = booking.scheduledAt.toDate();
    const end = booking.scheduledEndAt?.toDate() || new Date(start.getTime() + (booking.duration || 60) * 60000);

    const event = {
      title: booking.serviceName || t('bookings.detail.defaultBookingTitle'),
      description: `Prenotazione con ${booking.providerName || 'Provider'}`,
      location: booking.location?.address || '',
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    };

    // Google Calendar URL
    const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
      event.title
    )}&dates=${start.toISOString().replace(/[-:]/g, '').split('.')[0]}/${end
      .toISOString()
      .replace(/[-:]/g, '')
      .split('.')[0]}&details=${encodeURIComponent(
      event.description
    )}&location=${encodeURIComponent(event.location)}`;

    window.open(googleUrl, '_blank');
  };

  const handleShare = async () => {
    const shareData = {
      title: 'La mia prenotazione VFit',
      text: `Ho prenotato ${booking.serviceName} con ${booking.providerName}`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // User cancelled
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href);
      alert(t('bookings.detail.linkCopied'));
    }
  };

  const handleChat = () => {
    router.push(`/chat/${booking.providerId}`);
  };

  const handleReview = () => {
    router.push(`/bookings/${bookingId}/review`);
  };

  const statusEntry = statusConfig[booking.status];
  const statusLabel = t(statusEntry.labelKey as Parameters<typeof t>[0]);
  const scheduledAt = booking.scheduledAt.toDate();
  const isPast = scheduledAt < new Date();
  const canCancel = (booking.status === 'confirmed' || booking.status === 'pending') && !isPast;
  const canReschedule = booking.status === 'confirmed' && !isPast;
  const canReview = booking.status === 'completed' && !booking.hasReviewed;

  return (
    <div className="min-h-screen bg-background-dark">
      {(justConfirmed || justRescheduled || justReviewed || isFallbackBooking) && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'border-b p-4',
            isFallbackBooking ? 'border-warning/30 bg-warning/15' : 'border-success/30 bg-success/20'
          )}
        >
          {justConfirmed && (
            <div className="mb-2 flex items-center gap-3 last:mb-0">
              <CheckCircle className="h-6 w-6 text-success" />
              <div>
                <p className="font-semibold text-success">{t('bookings.detail.confirmedTitle')}</p>
                <p className="text-sm text-success/80">{t('bookings.detail.confirmedSubtitle')}</p>
              </div>
            </div>
          )}
          {justRescheduled && (
            <div className="mb-2 flex items-center gap-3 last:mb-0">
              <RotateCcw className="h-6 w-6 text-success" />
              <div>
                <p className="font-semibold text-success">{t('bookings.detail.rescheduledTitle')}</p>
                <p className="text-sm text-success/80">{t('bookings.detail.rescheduledSubtitle')}</p>
              </div>
            </div>
          )}
          {justReviewed && (
            <div className="mb-2 flex items-center gap-3 last:mb-0">
              <Star className="h-6 w-6 text-success" />
              <div>
                <p className="font-semibold text-success">{t('bookings.detail.reviewedTitle')}</p>
                <p className="text-sm text-success/80">{t('bookings.detail.reviewedSubtitle')}</p>
              </div>
            </div>
          )}
          {isFallbackBooking && (
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-warning" />
              <div>
                <p className="font-semibold text-warning">{t('bookings.detail.fallbackTitle')}</p>
                <p className="text-sm text-warning/90">
                  {t('bookings.detail.fallbackSubtitle')}
                </p>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-20 bg-background-dark/95 backdrop-blur-md border-b border-white/10">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <ChevronLeft className="w-6 h-6 text-white" />
            </button>
            <h1 className="text-lg font-semibold text-white">{t('bookings.detail.title')}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <Share2 className="w-5 h-5 text-text-secondary" />
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4 pb-32">
        {/* Status Card */}
        <div className="bg-[#2A2D3A]/50 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-12 h-12 rounded-full flex items-center justify-center',
                booking.status === 'confirmed' && 'bg-success/20',
                booking.status === 'pending' && 'bg-warning/20',
                booking.status === 'cancelled' && 'bg-error/20',
                booking.status === 'completed' && 'bg-[var(--section-primary)]/20',
              )}>
                <statusEntry.icon className={cn(
                  'w-6 h-6',
                  booking.status === 'confirmed' && 'text-success',
                  booking.status === 'pending' && 'text-warning',
                  booking.status === 'cancelled' && 'text-error',
                  booking.status === 'completed' && 'text-[var(--section-primary)]',
                )} />
              </div>
              <div>
                <p className="text-sm text-text-secondary">{t('bookings.detail.statusLabel')}</p>
                <p className="font-semibold text-white">{statusLabel}</p>
              </div>
            </div>
            <Badge variant={statusEntry.variant}>{statusLabel}</Badge>
          </div>
        </div>

        {/* Provider Card */}
        <div className="bg-[#2A2D3A]/50 rounded-2xl p-4">
          <div className="flex items-center gap-4">
            <Avatar
              src={booking.providerAvatar}
              alt={booking.providerName}
              size="xl"
            />
            <div className="flex-1">
              <h2 className="font-semibold text-white">{booking.providerName}</h2>
              <p className="text-text-secondary">{booking.serviceName}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleChat}
                className="p-2 rounded-full bg-[var(--section-primary)]/20 text-[var(--section-primary)] hover:bg-[var(--section-primary)]/30 transition-colors"
              >
                <MessageCircle className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Check-in ticket */}
        {booking.status !== 'cancelled' && (
          <div className="bg-[#2A2D3A]/60 rounded-2xl border border-white/10 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-text-tertiary">Check-in</p>
                <p className="font-semibold text-white">{t('bookings.detail.checkinLabel')}</p>
              </div>
              <Badge variant="partner" size="sm">QR Ticket</Badge>
            </div>

            <div className="mx-auto w-fit rounded-xl bg-white p-3 shadow-lg">
              <div
                className="grid h-40 w-40 gap-0.5 bg-white"
                style={{ gridTemplateColumns: 'repeat(21, minmax(0, 1fr))' }}
              >
                {qrCells.map((filled, index) => (
                  <span
                    key={index}
                    className={cn('h-1.5 w-1.5 rounded-[1px]', filled ? 'bg-black' : 'bg-white')}
                  />
                ))}
              </div>
            </div>

            <p className="mt-3 text-center text-xs font-mono tracking-wide text-text-secondary">
              {booking.id.toUpperCase()}
            </p>
          </div>
        )}

        {/* Date & Time */}
        <div className="bg-[#2A2D3A]/50 rounded-2xl p-4 space-y-3">
          <h3 className="font-semibold text-white">{t('bookings.detail.dateAndTime')}</h3>

          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-[var(--section-primary)]" />
            <div>
              <p className="text-white">
                {scheduledAt.toLocaleDateString(toLocaleTag(locale), {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-[var(--section-primary)]" />
            <div>
              <p className="text-white">
                {scheduledAt.toLocaleTimeString(toLocaleTag(locale), {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {' '}{t('bookings.detail.durationLabel', { count: booking.duration })}
              </p>
            </div>
          </div>

          {!isPast && booking.status !== 'cancelled' && (
            <button
              onClick={handleAddToCalendar}
              className="w-full mt-2 py-2.5 bg-white/10 rounded-xl text-sm font-medium text-white hover:bg-white/20 transition-colors flex items-center justify-center gap-2"
            >
              <Calendar className="w-4 h-4" />
              {t('bookings.detail.addToCalendar')}
            </button>
          )}
        </div>

        {/* Location */}
        {booking.location && (
          <div className="bg-[#2A2D3A]/50 rounded-2xl p-4 space-y-3">
            <h3 className="font-semibold text-white">{t('bookings.detail.location')}</h3>

            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-[var(--section-primary)] mt-0.5" />
              <div>
                <p className="text-white">{booking.location.address}</p>
                <a
                  href={`https://maps.google.com/?q=${booking.location.lat},${booking.location.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--section-primary)] hover:underline mt-1 inline-block"
                >
                  {t('bookings.detail.getDirections')}
                </a>
              </div>
            </div>

            {booking.location.lat && booking.location.lng && (
              <div className="h-40 rounded-xl overflow-hidden mt-3">
                <GoogleMap
                  gyms={[{
                    id: booking.id,
                    name: booking.providerName || 'Provider',
                    city: 'Milano',
                    rating: 5,
                    reviewCount: 0,
                    lat: booking.location.lat,
                    lng: booking.location.lng,
                  }]}
                  className="h-full"
                />
              </div>
            )}
          </div>
        )}

        {/* Payment Info */}
        <div className="bg-[#2A2D3A]/50 rounded-2xl p-4 space-y-3">
          <h3 className="font-semibold text-white">{t('bookings.detail.payment')}</h3>

          <div className="flex items-center justify-between">
            <span className="text-text-secondary">{t('bookings.detail.statusLabel')}</span>
            <Badge variant={booking.paymentStatus === 'paid' ? 'success' : 'warning'}>
              {booking.paymentStatus === 'paid'
                ? t('bookings.detail.paymentPaid')
                : t('bookings.detail.paymentPending')}
            </Badge>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-text-secondary">{t('common.total')}</span>
            <span className="font-semibold text-white">{formatPrice(booking.totalPrice)}</span>
          </div>

          {booking.promotionCode && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">{t('bookings.detail.promoCode')}</span>
              <span className="text-success">{booking.promotionCode}</span>
            </div>
          )}

          <button className="w-full mt-2 py-2.5 bg-white/10 rounded-xl text-sm font-medium text-white hover:bg-white/20 transition-colors flex items-center justify-center gap-2">
            <Download className="w-4 h-4" />
            {t('bookings.detail.downloadReceipt')}
          </button>
        </div>

        {/* Booking ID */}
        <div className="flex items-center justify-between text-sm text-text-tertiary">
          <span>{t('bookings.detail.bookingId')}</span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(booking.id);
              alert(t('bookings.detail.idCopied'));
            }}
            className="flex items-center gap-1 hover:text-white transition-colors"
          >
            {booking.id}
            <Copy className="w-3 h-3" />
          </button>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {canReview && (
            <Button
              onClick={handleReview}
              className="w-full"
            >
              <Star className="w-5 h-5 mr-2" />
              {t('booking.card.leaveReview')}
            </Button>
          )}

          {canReschedule && (
            <Button
              variant="secondary"
              onClick={() => router.push(`/bookings/${bookingId}/reschedule`)}
              className="w-full"
            >
              <RotateCcw className="w-5 h-5 mr-2" />
              {t('booking.card.reschedule')}
            </Button>
          )}

          {canCancel && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="w-full py-3 border border-error/30 text-error rounded-xl font-medium hover:bg-error/10 transition-colors"
            >
              <X className="w-5 h-5 inline mr-2" />
              {t('booking.card.cancelAriaLabel')}
            </button>
          )}
        </div>
      </div>

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-[#2A2D3A] rounded-2xl p-6 w-full max-w-sm"
          >
            <h3 className="text-lg font-semibold text-white mb-2">
              {t('bookings.detail.cancelModal.title')}
            </h3>
            <p className="text-text-secondary text-sm mb-4">
              {t('bookings.detail.cancelModal.body')}
            </p>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowCancelModal(false)}
                className="flex-1"
              >
                {t('bookings.detail.cancelModal.keep')}
              </Button>
              <button
                onClick={handleCancel}
                className="flex-1 py-3 bg-error text-white rounded-xl font-medium hover:bg-error/90 transition-colors"
              >
                {t('common.cancel')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

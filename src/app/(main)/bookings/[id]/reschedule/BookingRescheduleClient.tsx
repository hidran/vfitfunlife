'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, CheckCircle2, Clock, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBookingStore } from '@/stores/bookingStore';
import { buildFallbackBooking, getBookingSectionMeta } from '@/lib/bookingUtils';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';
import { AvailabilityPicker } from '@/components/booking';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/Avatar';

function mergeDateAndTime(date: Date, time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

export default function BookingRescheduleClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { t, locale } = useI18n();

  function formatTime(date: Date) {
    return date.toLocaleTimeString(toLocaleTag(locale), {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
  const bookingId = params.id;

  const {
    userBookings,
    currentBooking,
    availability,
    isLoadingAvailability,
    fetchAvailability,
    rescheduleBooking,
  } = useBookingStore();

  const booking = useMemo(() => {
    return (
      userBookings.find((entry) => entry.id === bookingId) ||
      (currentBooking?.id === bookingId ? currentBooking : null) ||
      buildFallbackBooking(bookingId)
    );
  }, [bookingId, currentBooking, userBookings]);

  const sectionMeta = getBookingSectionMeta(booking.serviceName);
  const currentDate = booking.scheduledAt.toDate();
  const currentTime = formatTime(currentDate);
  const isReschedulable = booking.status === 'confirmed' || booking.status === 'pending';

  const [selectedDate, setSelectedDate] = useState<Date | null>(currentDate);
  const [selectedTime, setSelectedTime] = useState<string | null>(currentTime);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isReschedulable || !booking.providerId || !selectedDate) return;
    void fetchAvailability(booking.providerId, selectedDate);
  }, [booking.providerId, fetchAvailability, isReschedulable, selectedDate]);

  const hasChanged = useMemo(() => {
    if (!selectedDate || !selectedTime) return false;
    return (
      selectedDate.toDateString() !== currentDate.toDateString() || selectedTime !== currentTime
    );
  }, [currentDate, currentTime, selectedDate, selectedTime]);

  const handleConfirm = async () => {
    if (!selectedDate || !selectedTime || !isReschedulable) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const nextDate = mergeDateAndTime(selectedDate, selectedTime);
      await rescheduleBooking(booking.id, nextDate, selectedTime);
      setIsComplete(true);
      setTimeout(() => {
        router.replace(`/bookings/${booking.id}?rescheduled=true`);
      }, 1000);
    } catch {
      setError(t('bookings.reschedule.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background-dark">
      <div className="sticky top-0 z-20 border-b border-white/10 bg-background-dark/95 backdrop-blur-md">
        <div className="flex items-center gap-3 p-4">
          <button
            onClick={() => router.back()}
            className="rounded-full p-2 transition-colors hover:bg-white/10"
          >
            <ArrowLeft className="h-5 w-5 text-white" />
          </button>
          <h1 className="text-lg font-semibold text-white">{t('bookings.reschedule.title')}</h1>
        </div>
      </div>

      <div className="space-y-4 p-4 pb-28">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span
              className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: sectionMeta.color, backgroundColor: sectionMeta.softColor }}
            >
              {sectionMeta.label}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Avatar src={booking.providerAvatar} alt={booking.providerName} size="lg" />
            <div>
              <p className="font-semibold text-white">{booking.providerName}</p>
              <p className="text-sm text-text-secondary">{booking.serviceName}</p>
            </div>
          </div>
        </div>

        {!isReschedulable ? (
          <div className="rounded-2xl border border-warning/40 bg-warning/15 p-4">
            <p className="font-semibold text-warning">{t('bookings.reschedule.notAllowed.title')}</p>
            <p className="mt-1 text-sm text-warning/90">
              {t('bookings.reschedule.notAllowed.subtitle')}
            </p>
            <Button className="mt-4" onClick={() => router.replace(`/bookings/${booking.id}`)}>
              {t('bookings.reschedule.backToDetails')}
            </Button>
          </div>
        ) : isComplete ? (
          <div className="rounded-2xl border border-success/30 bg-success/15 p-5 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-success" />
            <p className="text-lg font-semibold text-success">{t('bookings.reschedule.successTitle')}</p>
            <p className="mt-1 text-sm text-success/80">
              {t('bookings.reschedule.successSubtitle')}
            </p>
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h2 className="mb-3 font-semibold text-white">{t('bookings.reschedule.currentTime')}</h2>
              <div className="grid gap-2 text-sm text-text-secondary">
                <p className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[var(--section-primary)]" />
                  {currentDate.toLocaleDateString(toLocaleTag(locale), {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
                <p className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[var(--section-primary)]" />
                  {currentTime}
                </p>
              </div>
            </section>

            <AvailabilityPicker
              availability={availability}
              selectedDate={selectedDate}
              selectedTime={selectedTime}
              onSelectDate={setSelectedDate}
              onSelectTime={setSelectedTime}
              isLoading={isLoadingAvailability}
            />

            <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h2 className="mb-2 font-semibold text-white">{t('bookings.reschedule.newSlot')}</h2>
              {selectedDate && selectedTime ? (
                <p className="text-sm text-text-secondary">
                  {selectedDate.toLocaleDateString(toLocaleTag(locale), {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                  {' · '}
                  {selectedTime}
                </p>
              ) : (
                <p className="text-sm text-text-tertiary">{t('bookings.reschedule.selectHint')}</p>
              )}
            </section>
          </>
        )}

        {error && (
          <div className="rounded-xl border border-error/40 bg-error/15 p-3 text-sm text-error">
            {error}
          </div>
        )}
      </div>

      {isReschedulable && !isComplete && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-background-dark/90 p-4 backdrop-blur-xl">
          <Button
            className={cn('w-full', hasChanged ? '' : 'opacity-70')}
            onClick={handleConfirm}
            disabled={!selectedDate || !selectedTime || !hasChanged || isSubmitting}
            isLoading={isSubmitting}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            {t('bookings.reschedule.confirm')}
          </Button>
        </div>
      )}
    </div>
  );
}

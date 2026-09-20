'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Calendar, CheckCircle2, Clock, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBookingStore } from '@/stores/bookingStore';
import { useAuthStore } from '@/stores/authStore';
import { buildFallbackBooking, getBookingSectionMeta } from '@/lib/bookingUtils';
import { canReschedule } from '@/lib/bookingStatus';
import { rescheduleErrorKey } from '@/lib/availability/errors';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';
import { AvailabilityPicker } from '@/components/booking';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/Avatar';

export default function BookingRescheduleClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, locale } = useI18n();

  // Served from /bookings/reschedule/?id=... . useSearchParams can hydrate empty on the first
  // paint under output:'export', and this route has no [id] segment to fall back to, so read
  // the raw URL as the last resort.
  const bookingId =
    searchParams.get('id') ??
    (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('id') : null) ??
    '';

  function formatTime(date: Date) {
    return date.toLocaleTimeString(toLocaleTag(locale), {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  const {
    userBookings,
    currentBooking,
    availability,
    isLoadingAvailability,
    fetchAvailability,
    fetchBooking,
    rescheduleBooking,
  } = useBookingStore();
  const { user } = useAuthStore();

  const isKnown =
    userBookings.some((entry) => entry.id === bookingId) || currentBooking?.id === bookingId;

  useEffect(() => {
    // Both entry points can land here with an empty client store: a deep link from a push, and
    // the trainer's own booking screen, which fills a different store entirely. Keyed on `user`
    // because a cold load restores the Firebase session asynchronously, and the read is denied
    // to nobody-in-particular.
    if (!bookingId || !user || isKnown) return;
    void fetchBooking(bookingId);
  }, [bookingId, fetchBooking, isKnown, user]);

  const booking = useMemo(() => {
    return (
      userBookings.find((entry) => entry.id === bookingId) ||
      (currentBooking?.id === bookingId ? currentBooking : null) ||
      buildFallbackBooking(bookingId)
    );
  }, [bookingId, currentBooking, userBookings]);

  // `instructorId` is the canonical trainer link on a booking document; `providerId` only
  // survives on pre-P0-1 ones. Reading providerId alone left the picker with nothing to ask about.
  const instructorId = booking.instructorId || booking.providerId || '';
  // Same story for the trainer's name: booking documents denormalize `instructorName`.
  const instructorName = booking.providerName || booking.instructorName || '';
  const sectionMeta = getBookingSectionMeta(booking.serviceName);
  const currentDate = booking.scheduledAt.toDate();
  const currentTime = formatTime(currentDate);
  // The same gate the entry points use, so a booking can never be offered here and refused
  // on arrival. The server checks it again, and owns the verdict.
  const isReschedulable = Boolean(bookingId) && canReschedule(booking.status, currentDate < new Date());

  const [selectedDate, setSelectedDate] = useState<Date | null>(currentDate);
  const [selectedTime, setSelectedTime] = useState<string | null>(currentTime);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isReschedulable || !instructorId || !booking.serviceId || !selectedDate) return;
    // Excluding this booking is what lets its own current time still show as free, instead of
    // the booking blocking the slot it is sitting in.
    void fetchAvailability(instructorId, booking.serviceId, selectedDate, booking.id);
  }, [booking.id, booking.serviceId, fetchAvailability, instructorId, isReschedulable, selectedDate]);

  const hasChanged = useMemo(() => {
    if (!selectedDate || !selectedTime) return false;
    return (
      selectedDate.toDateString() !== currentDate.toDateString() || selectedTime !== currentTime
    );
  }, [currentDate, currentTime, selectedDate, selectedTime]);

  const handleConfirm = async () => {
    if (!selectedDate || !selectedTime || !isReschedulable) return;

    // The slot's own instant: its time is Italian time whatever the device's zone is. Refuse to
    // assemble one from the picked day plus "HH:mm" — that would move the booking to a different
    // moment than the one on screen for anyone outside Europe/Rome.
    const startsAt = availability.find((s) => s.time === selectedTime)?.startsAt;
    if (!startsAt) {
      setError(t('bookings.reschedule.error.slotUnavailable'));
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await rescheduleBooking(booking.id, startsAt);
      setIsComplete(true);
      setTimeout(() => {
        router.replace(`/bookings/detail?id=${booking.id}&rescheduled=true`);
      }, 1000);
    } catch (err) {
      const key = rescheduleErrorKey(err);
      setError(t(key));
      if (key === 'bookings.reschedule.error.slotUnavailable' && instructorId && booking.serviceId) {
        // Someone took it while this screen was open: show the day as it is now.
        void fetchAvailability(instructorId, booking.serviceId, selectedDate, booking.id);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background-dark">
      <div className="sticky top-0 z-20 border-b border-hairline bg-background-dark/95 backdrop-blur-md">
        <div className="flex items-center gap-3 p-4">
          <button
            onClick={() => router.back()}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-surface-2"
            aria-label={t('bookings.reschedule.backToDetails')}
          >
            <ArrowLeft className="h-5 w-5 text-content" />
          </button>
          <h1 className="text-lg font-semibold text-content">{t('bookings.reschedule.title')}</h1>
        </div>
      </div>

      <div className="space-y-4 p-4 pb-28">
        <div className="rounded-2xl border border-hairline bg-surface-2 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span
              className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: sectionMeta.color, backgroundColor: sectionMeta.softColor }}
            >
              {sectionMeta.label}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Avatar src={booking.providerAvatar} alt={instructorName} size="lg" />
            <div>
              <p className="font-semibold text-content">{instructorName}</p>
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
            <Button
              className="mt-4"
              onClick={() =>
                router.replace(bookingId ? `/bookings/detail?id=${bookingId}` : '/bookings')
              }
            >
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
            <section className="rounded-2xl border border-hairline bg-surface-2 p-4">
              <h2 className="mb-3 font-semibold text-content">{t('bookings.reschedule.currentTime')}</h2>
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

            <section className="rounded-2xl border border-hairline bg-surface-2 p-4">
              <h2 className="mb-2 font-semibold text-content">{t('bookings.reschedule.newSlot')}</h2>
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
        <div className="fixed bottom-0 left-0 right-0 border-t border-hairline bg-background-dark/90 p-4 backdrop-blur-xl">
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

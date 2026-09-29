'use client';

import React, { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  Calendar,
  Clock,
  MapPin,
  Wallet,
  Ticket,
  Coins,
  Shield,
  Sparkles,
  AlertCircle,
  Check,
  Loader2,
  MessageSquare,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn, formatPrice } from '@/lib/utils';
import { useBookingStore } from '@/stores/bookingStore';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/Spinner';
import { Avatar } from '@/components/ui/Avatar';
import { PriceBreakdown } from '@/components/booking';
import type { PaymentMethod } from '@/types/booking';
import { computeBookingPrice } from '@/lib/bookingPrice';
import { xpForBooking } from '@/lib/gamification';
import { isSlotUnavailableError } from '@/lib/availability/errors';
import { BOOKING_NOTE_MAX_LENGTH } from '@/lib/bookingNote';

export default function BookingConfirmPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { user } = useAuthStore();
  const {
    selectedProvider,
    selectedService,
    selectedDate,
    selectedTime,
    availability,
    appliedPromo,
    isApplyingPromo,
    createBooking,
    applyPromoCode,
    clearPromoCode,
  } = useBookingStore();

  const [promoCode, setPromoCode] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slotTaken, setSlotTaken] = useState(false);
  // The server's semantics: all-or-nothing "use my points" (as many as cover the price).
  const [usePoints, setUsePoints] = useState(false);
  // Note for the trainer (B2). createBooking cleans and caps it again server-side.
  const [userNotes, setUserNotes] = useState('');
  const noteId = useId();
  const noteHintId = useId();
  const termsId = useId();
  const termsTextId = useId();
  const usePointsId = useId();

  // Redirect if no selection
  if (!selectedProvider || !selectedService || !selectedDate || !selectedTime) {
    return (
      <div className="min-h-screen bg-background-dark flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-warning mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-content mb-2">
            {t('bookings.confirm.noBookingTitle')}
          </h2>
          <p className="text-text-secondary mb-4">
            {t('bookings.confirm.noBookingSubtitle')}
          </p>
          <Button onClick={() => router.push('/booking')}>{t('bookings.confirm.backToSearch')}</Button>
        </div>
      </div>
    );
  }

  // Exactly what createBooking will store as finalPrice (same formula, src/lib/bookingPrice).
  // No platform fee and no card: the client pays the trainer directly.
  const bookingType = 'in_venue'; // locationType 'in_person' below, see toBookingType
  const price = computeBookingPrice({
    service: selectedService,
    user,
    bookingType,
    promo: appliedPromo
      ? {
          discountType: appliedPromo.type,
          discountValue: appliedPromo.value,
          maxDiscount: appliedPromo.maxDiscount,
        }
      : null,
    usePoints,
  });
  const totalPrice = price.finalPrice;
  const pointsBalance = user?.pointsBalance ?? 0;

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    try {
      await applyPromoCode(promoCode);
    } catch {
      setError(t('bookings.confirm.promoInvalid'));
    }
  };

  const handleCreateBooking = async () => {
    if (!termsAccepted) {
      setError(t('bookings.confirm.acceptTermsError'));
      return;
    }

    // The slot's own instant: its time is Italian time, whatever the device's zone is. Refuse
    // to guess a device-local instant when it's missing (a failed or stale availability
    // fetch can leave selectedTime set with nothing in `availability` to back it up) — that
    // could book a different time than the one shown, or one the provider is not free at.
    const startsAt = availability.find((s) => s.time === selectedTime)?.startsAt;
    if (!startsAt) {
      setSlotTaken(true);
      setError(t('booking.availability.slotTaken'));
      return;
    }

    setIsCreating(true);
    setError(null);
    setSlotTaken(false);

    try {
      const scheduledAt = new Date(startsAt);
      const bookingData = {
        providerId: selectedProvider.id,
        serviceId: selectedService.id,
        scheduledAt,
        duration: selectedService.durationMinutes,
        locationType: 'in_person' as const,
        userNotes: userNotes.trim() || undefined,
        promotionCode: appliedPromo?.code,
        // Mapped to the callable's boolean `usePoints`; the server picks the amount.
        pointsToUse: price.pointsUsed,
        // Off-platform: paid to the trainer in person / as agreed.
        paymentMethod: 'cash' as PaymentMethod,
      };

      const booking = await createBooking(bookingData);
      router.push(`/bookings/detail?id=${booking.id}&confirmed=true`);
    } catch (err: any) {
      if (isSlotUnavailableError(err)) {
        // Someone else got there first (or the provider changed their hours).
        setSlotTaken(true);
        setError(t('booking.availability.slotTaken'));
      } else {
        setError(err.message || t('bookings.confirm.bookingError'));
      }
      setIsCreating(false);
    }
  };

  const scheduledAt = new Date(selectedDate);
  const [hours, minutes] = selectedTime.split(':').map(Number);
  scheduledAt.setHours(hours, minutes, 0, 0);

  return (
    <div className="min-h-screen bg-background-dark">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background-dark/95 backdrop-blur-md border-b border-hairline">
        <div className="p-4 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-full hover:bg-surface-2 transition-colors"
          >
            <ChevronLeft className="w-6 h-6 text-content" />
          </button>
          <h1 className="text-lg font-semibold text-content">{t('bookings.confirm.title')}</h1>
        </div>
      </div>

      <div className="p-4 space-y-4 pb-44">
        {/* Provider & Service Summary */}
        <div className="bg-surface-elevated/50 rounded-2xl p-4">
          <div className="flex gap-3">
            <Avatar
              src={selectedProvider.avatarUrl}
              alt={selectedProvider.fullName}
              size="lg"
            />
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-content">{selectedProvider.fullName}</h3>
              <p className="text-text-secondary text-sm truncate">
                {selectedService.name}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-3 text-sm">
              <Calendar className="w-4 h-4 text-[var(--section-primary)]" />
              <span className="text-content">
                {scheduledAt.toLocaleDateString(toLocaleTag(locale), {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Clock className="w-4 h-4 text-[var(--section-primary)]" />
              <span className="text-content">
                {selectedTime} &middot; {selectedService.durationMinutes} min
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <MapPin className="w-4 h-4 text-[var(--section-primary)]" />
              <span className="text-text-secondary">
                {selectedProvider.location?.address || t('bookings.confirm.addressToConfirm')}
              </span>
            </div>
          </div>
        </div>

        {/* Note for the trainer */}
        <div className="bg-surface-elevated/50 rounded-2xl p-4">
          <label
            htmlFor={noteId}
            className="font-semibold text-content mb-1 flex items-center gap-2"
          >
            <MessageSquare className="w-4 h-4 text-[var(--section-primary)]" aria-hidden="true" />
            {t('bookings.confirm.noteLabel')}
          </label>
          <p className="text-xs text-text-tertiary mb-3">{t('bookings.confirm.noteHint')}</p>
          <textarea
            id={noteId}
            rows={3}
            value={userNotes}
            maxLength={BOOKING_NOTE_MAX_LENGTH}
            onChange={(e) => setUserNotes(e.target.value)}
            placeholder={t('bookings.confirm.notePlaceholder')}
            aria-describedby={noteHintId}
            className="w-full resize-none rounded-xl border border-content/15 bg-surface-sunken p-3 text-sm text-content outline-none transition-colors focus:border-[var(--section-primary)]"
          />
          <p
            id={noteHintId}
            aria-live="polite"
            className={cn(
              'mt-1 text-right text-xs',
              userNotes.length >= BOOKING_NOTE_MAX_LENGTH ? 'text-warning' : 'text-text-tertiary'
            )}
          >
            {t('bookings.confirm.noteCounter', { count: userNotes.length, max: BOOKING_NOTE_MAX_LENGTH })}
          </p>
        </div>

        {/* Promo Code */}
        <div className="bg-surface-elevated/50 rounded-2xl p-4">
          <h3 className="font-semibold text-content mb-3 flex items-center gap-2">
            <Ticket className="w-4 h-4 text-[var(--section-primary)]" />
            {t('bookings.confirm.promoTitle')}
          </h3>

          {appliedPromo ? (
            <div className="flex items-center justify-between bg-success/10 border border-success/20 rounded-xl p-3">
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-success" />
                <div>
                  <p className="font-medium text-content">{appliedPromo.code}</p>
                  <p className="text-sm text-success">{t('bookings.confirm.discountApplied')}</p>
                </div>
              </div>
              <button
                onClick={clearPromoCode}
                className="text-text-tertiary hover:text-error transition-colors"
              >
                {t('common.remove')}
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder={t('bookings.confirm.promoPlaceholder')}
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                className="flex-1"
              />
              <Button
                variant="secondary"
                onClick={handleApplyPromo}
                disabled={!promoCode.trim() || isApplyingPromo}
              >
                {isApplyingPromo ? <Spinner size="sm" /> : t('bookings.confirm.promoApply')}
              </Button>
            </div>
          )}
        </div>

        {/* Points — the server's "use my points": all or nothing, as many as cover the price */}
        {pointsBalance > 0 && (
          <div className="bg-surface-elevated/50 rounded-2xl p-4">
            <label htmlFor={usePointsId} className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
              <span>
                <span className="font-semibold text-content flex items-center gap-2">
                  <Coins className="w-4 h-4 text-[var(--section-accent)]" aria-hidden="true" />
                  {t('bookings.confirm.usePoints')}
                </span>
                <span className="block text-sm text-text-secondary">
                  {t('bookings.confirm.pointsBalance', { count: pointsBalance.toLocaleString() })}
                  {' · '}
                  {t('bookings.confirm.pointsValue', { price: formatPrice(pointsBalance * 0.01) })}
                </span>
              </span>
              <input
                id={usePointsId}
                type="checkbox"
                role="switch"
                checked={usePoints}
                onChange={(e) => setUsePoints(e.target.checked)}
                className="h-6 w-6 flex-shrink-0 cursor-pointer accent-[var(--section-accent)]"
              />
            </label>
            {usePoints && price.pointsUsed > 0 && (
              <p className="mt-2 text-sm text-[var(--section-accent)]">
                {t('bookings.confirm.usePointsApplied', {
                  count: price.pointsUsed.toLocaleString(),
                  price: formatPrice(price.pointsValue),
                })}
              </p>
            )}
          </div>
        )}

        {/* Price Breakdown */}
        <PriceBreakdown
          servicePrice={price.originalPrice}
          discountAmount={price.discountAmount}
          pointsUsed={price.pointsUsed}
          pointsValue={price.pointsValue}
          totalPrice={totalPrice}
        />

        {/* Payment — off-platform, straight to the trainer (decision D1). Nothing is charged here. */}
        <div className="bg-surface-elevated/50 rounded-2xl p-4 space-y-3" data-testid="pay-trainer">
          <h3 className="font-semibold text-content flex items-center gap-2">
            <Wallet className="w-4 h-4 text-[var(--section-primary)]" aria-hidden="true" />
            {t('bookings.confirm.paymentTitle')}
          </h3>
          <p className="text-sm text-text-secondary">
            {t('bookings.confirm.payTrainerBody', { price: formatPrice(totalPrice) })}
          </p>
          <p className="text-sm text-content flex items-start gap-2">
            <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0 text-[var(--section-accent)]" aria-hidden="true" />
            {t('bookings.confirm.payTrainerXp', { xp: xpForBooking() })}
          </p>
        </div>

        {/* Terms — a real checkbox with a label: its name is read out, and the tap target is
            44px around the 20px box (the negative margins keep the box where it was). */}
        <div className="flex items-start">
          <label
            htmlFor={termsId}
            className="relative -ml-3 -mt-2.5 flex h-11 w-11 flex-shrink-0 cursor-pointer items-center justify-center"
          >
            <input
              id={termsId}
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              aria-describedby={termsTextId}
              className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
            <span
              aria-hidden="true"
              className={cn(
                'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--section-primary)] peer-focus-visible:ring-offset-2',
                termsAccepted
                  ? 'bg-[var(--section-primary)] border-[var(--section-primary)]'
                  : 'border-content/30 peer-hover:border-content/50'
              )}
            >
              {termsAccepted && <Check className="w-3 h-3 text-white" />}
            </span>
            <span className="sr-only">
              {`${t('bookings.confirm.termsPrefix')} ${t('bookings.confirm.termsOfService')} ${t('bookings.confirm.termsAnd')} ${t('bookings.confirm.cancellationPolicy')}`}
            </span>
          </label>
          {/* Tapping the sentence toggles too (the link buttons inside keep their own clicks). */}
          <p
            id={termsTextId}
            className="cursor-pointer text-sm text-text-secondary leading-relaxed"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('button')) return;
              setTermsAccepted((v) => !v);
            }}
          >
            {t('bookings.confirm.termsPrefix')}{' '}
            <button className="text-[var(--section-primary)] underline">
              {t('bookings.confirm.termsOfService')}
            </button>{' '}
            {t('bookings.confirm.termsAnd')}{' '}
            <button className="text-[var(--section-primary)] underline">
              {t('bookings.confirm.cancellationPolicy')}
            </button>
            {'. '}{t('bookings.confirm.termsSuffix')}
          </p>
        </div>

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-error/10 border border-error/20 rounded-xl p-3 flex items-center gap-2"
          >
            <AlertCircle className="w-5 h-5 text-error flex-shrink-0" />
            <p className="flex-1 text-sm text-error">{error}</p>
            {slotTaken && (
              <Button
                variant="secondary"
                size="sm"
                className="min-h-[44px] flex-shrink-0"
                // Back to the picker: it refetches the day, and the taken time drops out.
                onClick={() => router.replace(`/book?providerId=${selectedProvider.id}`)}
              >
                {t('booking.availability.pickAnother')}
              </Button>
            )}
          </motion.div>
        )}
      </div>

      {/* Bottom Action Bar — sits above the fixed TabBar (h-16 + safe area) so the confirm button isn't covered */}
      <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 z-40 bg-surface-elevated border-t border-hairline p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-text-secondary text-sm">{t('common.total')}</p>
            <p className="text-2xl font-bold text-content">{formatPrice(totalPrice)}</p>
          </div>
          <Button
            onClick={handleCreateBooking}
            disabled={isCreating}
            className="flex-shrink-0 min-w-[140px]"
          >
            {isCreating ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                {t('bookings.confirm.waiting')}
              </>
            ) : (
              <>
                <Shield className="w-5 h-5 mr-2" />
                {t('bookings.confirm.confirmBtn')}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  Calendar,
  Clock,
  MapPin,
  CreditCard,
  Ticket,
  Coins,
  Shield,
  AlertCircle,
  Check,
  Loader2,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn, formatPrice } from '@/lib/utils';
import { useBookingStore } from '@/stores/bookingStore';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/Spinner';
import { Avatar } from '@/components/ui/Avatar';
import { PriceBreakdown, PaymentMethodSelector } from '@/components/booking';
import type { PaymentMethod } from '@/types/booking';

export default function BookingConfirmPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useAuthStore();
  const {
    selectedProvider,
    selectedService,
    selectedDate,
    selectedTime,
    appliedPromo,
    isApplyingPromo,
    createBooking,
    applyPromoCode,
    clearPromoCode,
  } = useBookingStore();

  const [promoCode, setPromoCode] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('card-1');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pointsToUse, setPointsToUse] = useState(0);

  // Redirect if no selection
  if (!selectedProvider || !selectedService || !selectedDate || !selectedTime) {
    return (
      <div className="min-h-screen bg-background-dark flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-warning mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">
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

  // Calculate pricing
  const servicePrice = selectedService.price;
  const platformFee = servicePrice * 0.05;
  const discountAmount = appliedPromo?.discount || 0;
  const pointsValue = pointsToUse * 0.01;
  const totalPrice = Math.max(0, servicePrice + platformFee - discountAmount - pointsValue);

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    try {
      await applyPromoCode(promoCode);
    } catch (err: any) {
      setError(err.message || t('bookings.confirm.promoInvalid'));
    }
  };

  const handleCreateBooking = async () => {
    if (!termsAccepted) {
      setError(t('bookings.confirm.acceptTermsError'));
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const [hours, minutes] = selectedTime.split(':').map(Number);
      const scheduledAt = new Date(selectedDate);
      scheduledAt.setHours(hours, minutes, 0, 0);

      const bookingData = {
        providerId: selectedProvider.id,
        serviceId: selectedService.id,
        scheduledAt,
        duration: selectedService.durationMinutes,
        locationType: 'in_person' as const,
        userNotes: '',
        promotionCode: appliedPromo?.code,
        pointsToUse,
        paymentMethod: 'card' as PaymentMethod,
      };

      const booking = await createBooking(bookingData);
      router.push(`/bookings/${booking.id}?confirmed=true`);
    } catch (err: any) {
      setError(err.message || t('bookings.confirm.bookingError'));
      setIsCreating(false);
    }
  };

  const scheduledAt = new Date(selectedDate);
  const [hours, minutes] = selectedTime.split(':').map(Number);
  scheduledAt.setHours(hours, minutes, 0, 0);

  // Mock payment methods
  const paymentMethods = [
    {
      id: 'card-1',
      type: 'card' as const,
      last4: '4242',
      brand: 'visa',
      expiryMonth: 12,
      expiryYear: 26,
      isDefault: true,
    },
    {
      id: 'card-2',
      type: 'card' as const,
      last4: '8888',
      brand: 'mastercard',
      expiryMonth: 8,
      expiryYear: 27,
      isDefault: false,
    },
  ];

  return (
    <div className="min-h-screen bg-background-dark">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background-dark/95 backdrop-blur-md border-b border-white/10">
        <div className="p-4 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
          <h1 className="text-lg font-semibold text-white">{t('bookings.confirm.title')}</h1>
        </div>
      </div>

      <div className="p-4 space-y-4 pb-32">
        {/* Provider & Service Summary */}
        <div className="bg-[#2A2D3A]/50 rounded-2xl p-4">
          <div className="flex gap-3">
            <Avatar
              src={selectedProvider.avatarUrl}
              alt={selectedProvider.fullName}
              size="lg"
            />
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-white">{selectedProvider.fullName}</h3>
              <p className="text-text-secondary text-sm truncate">
                {selectedService.name}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
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

        {/* Promo Code */}
        <div className="bg-[#2A2D3A]/50 rounded-2xl p-4">
          <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
            <Ticket className="w-4 h-4 text-[var(--section-primary)]" />
            {t('bookings.confirm.promoTitle')}
          </h3>

          {appliedPromo ? (
            <div className="flex items-center justify-between bg-success/10 border border-success/20 rounded-xl p-3">
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-success" />
                <div>
                  <p className="font-medium text-white">{appliedPromo.code}</p>
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

        {/* Points Redemption */}
        {user && user.pointsBalance > 0 && (
          <div className="bg-[#2A2D3A]/50 rounded-2xl p-4">
            <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
              <Coins className="w-4 h-4 text-[var(--section-accent)]" />
              {t('bookings.confirm.pointsTitle')}
            </h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-text-secondary text-sm">
                  {t('bookings.confirm.pointsBalance', { count: user.pointsBalance.toLocaleString() })}
                </p>
                <p className="text-xs text-text-tertiary">
                  {t('bookings.confirm.pointsValue', { price: formatPrice(user.pointsBalance * 0.01) })}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max={Math.min(user.pointsBalance, (totalPrice + pointsValue) * 100)}
                  step={100}
                  value={pointsToUse}
                  onChange={(e) => setPointsToUse(Number(e.target.value))}
                  className="w-24 accent-[var(--section-accent)]"
                />
                <span className="text-sm text-white w-16 text-right">
                  {pointsToUse.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Price Breakdown */}
        <PriceBreakdown
          servicePrice={servicePrice}
          platformFee={platformFee}
          discountAmount={discountAmount}
          pointsUsed={pointsToUse}
          pointsValue={pointsValue}
          totalPrice={totalPrice}
        />

        {/* Payment Method */}
        <div className="bg-[#2A2D3A]/50 rounded-2xl p-4">
          <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-[var(--section-primary)]" />
            {t('bookings.confirm.paymentTitle')}
          </h3>
          <PaymentMethodSelector
            methods={paymentMethods}
            selectedMethod={selectedPaymentMethod}
            onSelect={setSelectedPaymentMethod}
            walletBalance={user?.walletBalance || 0}
            allowCashAtVenue={true}
            venueName={selectedProvider.fullName}
            totalAmount={totalPrice}
          />
        </div>

        {/* Terms */}
        <div className="flex items-start gap-3">
          <button
            onClick={() => setTermsAccepted(!termsAccepted)}
            className={cn(
              'mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
              termsAccepted
                ? 'bg-[var(--section-primary)] border-[var(--section-primary)]'
                : 'border-white/30 hover:border-white/50'
            )}
          >
            {termsAccepted && <Check className="w-3 h-3 text-white" />}
          </button>
          <p className="text-sm text-text-secondary leading-relaxed">
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
            <p className="text-sm text-error">{error}</p>
          </motion.div>
        )}
      </div>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#2A2D3A] border-t border-white/10 p-4 safe-area-pb">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-text-secondary text-sm">{t('common.total')}</p>
            <p className="text-2xl font-bold text-white">{formatPrice(totalPrice)}</p>
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

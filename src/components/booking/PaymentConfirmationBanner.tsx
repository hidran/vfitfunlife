'use client';

/**
 * Shown to the client once the trainer has recorded the (off-platform) payment.
 *
 * The main action is "service received": confirming earns the client XP, exactly once
 * (server: functions/src/bookings/serviceReceived.ts). Silence auto-confirms after 48h
 * without XP, and the prompt stays up so the client can still confirm and collect it.
 * The dispute path captures a mismatch for admin review; it does not revert the status.
 */

import { useState } from 'react';
import { AlertCircle, CheckCircle, Euro, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { xpForBooking } from '@/lib/gamification';
import type { BookingPaymentConfirmation } from '@/types/firebase';

interface PaymentConfirmationBannerProps {
  confirmation: BookingPaymentConfirmation;
  onRespond: (response: 'confirmed' | 'disputed', disputeReason?: string) => Promise<void>;
}

export function PaymentConfirmationBanner({
  confirmation,
  onRespond,
}: PaymentConfirmationBannerProps) {
  const { t } = useI18n();
  const [showDispute, setShowDispute] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  // Already answered: show the outcome (and the XP it earned), not the prompt.
  if (confirmation.clientResponse) {
    const disputed = confirmation.clientResponse === 'disputed';
    const xp = confirmation.xpAwarded ?? 0;
    return (
      <div
        role="status"
        className={`rounded-xl border p-4 flex items-start gap-3 ${
          disputed ? 'border-error/40 bg-error/10' : 'border-success/40 bg-success/10'
        }`}
      >
        {disputed ? (
          <AlertCircle className="w-5 h-5 text-error shrink-0 mt-0.5" aria-hidden="true" />
        ) : (
          <CheckCircle className="w-5 h-5 text-success shrink-0 mt-0.5" aria-hidden="true" />
        )}
        <div>
          <p className="text-sm text-content">
            {t(disputed ? 'booking.payment.disputed' : 'booking.payment.confirmed')}
          </p>
          {!disputed && xp > 0 && (
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-[var(--section-accent)]">
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              {t('booking.payment.xpEarned', { xp })}
            </p>
          )}
        </div>
      </div>
    );
  }

  const respond = async (response: 'confirmed' | 'disputed') => {
    if (submitting) return;
    setSubmitting(true);
    setFailed(false);
    try {
      await onRespond(response, response === 'disputed' ? reason.trim() || undefined : undefined);
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Euro className="w-5 h-5 text-warning shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="font-semibold text-content">{t('booking.payment.banner.title')}</p>
          <p className="text-sm text-content-muted mt-1">
            {t('booking.payment.banner.body', { amount: String(confirmation.amount) })}
          </p>
          {confirmation.autoConfirmed && (
            <p className="text-xs text-content-muted mt-1">
              {t('booking.payment.autoConfirmedHint')}
            </p>
          )}
        </div>
      </div>

      {showDispute && (
        <div className="space-y-2">
          <label htmlFor="dispute-reason" className="text-sm font-medium text-content">
            {t('booking.payment.disputeReason')}
          </label>
          <textarea
            id="dispute-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            className="w-full rounded-lg bg-surface border border-hairline p-3 text-content text-sm"
          />
        </div>
      )}

      {failed && (
        <p role="alert" className="text-sm text-error">
          {t('booking.payment.error')}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {!showDispute ? (
          <>
            <Button
              onClick={() => respond('confirmed')}
              disabled={submitting}
              className="min-h-11 w-full"
            >
              <Sparkles className="w-4 h-4 mr-2" aria-hidden="true" />
              {t('booking.payment.confirm', { xp: xpForBooking() })}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowDispute(true)}
              disabled={submitting}
              className="min-h-11 w-full"
            >
              {t('booking.payment.dispute')}
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            onClick={() => respond('disputed')}
            disabled={submitting}
            className="min-h-11 w-full border-error/50 text-error"
          >
            {t('booking.payment.disputeSubmit')}
          </Button>
        )}
      </div>
    </div>
  );
}

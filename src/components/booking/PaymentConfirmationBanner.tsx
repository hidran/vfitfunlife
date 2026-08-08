'use client';

/**
 * Shown to the client after the trainer records an off-platform payment.
 *
 * Responding is optional by design — silence auto-confirms after 48h (see the
 * `autoConfirmPayments` job). The dispute path exists so a mismatch is captured for admin
 * review rather than silently accepted; it does not revert the booking's status.
 */

import { useState } from 'react';
import { AlertCircle, CheckCircle, Euro } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import type { MessageKey } from '@/i18n/messages';
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

  // Already answered (or auto-confirmed): show the outcome, not the prompt.
  if (confirmation.clientResponse) {
    const disputed = confirmation.clientResponse === 'disputed';
    return (
      <div
        className={`rounded-xl border p-4 flex items-start gap-3 ${
          disputed ? 'border-error/40 bg-error/10' : 'border-success/40 bg-success/10'
        }`}
      >
        {disputed ? (
          <AlertCircle className="w-5 h-5 text-error shrink-0 mt-0.5" />
        ) : (
          <CheckCircle className="w-5 h-5 text-success shrink-0 mt-0.5" />
        )}
        <p className="text-sm text-content">
          {t(
            (disputed ? 'booking.payment.disputed' : 'booking.payment.confirmed') as MessageKey,
          )}
        </p>
      </div>
    );
  }

  const respond = async (response: 'confirmed' | 'disputed') => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onRespond(response, response === 'disputed' ? reason.trim() || undefined : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Euro className="w-5 h-5 text-warning shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-content">
            {t('booking.payment.banner.title' as MessageKey)}
          </p>
          <p className="text-sm text-content-muted mt-1">
            {t('booking.payment.banner.body' as MessageKey, {
              amount: String(confirmation.amount),
            })}
          </p>
        </div>
      </div>

      {showDispute && (
        <div className="space-y-2">
          <label htmlFor="dispute-reason" className="text-sm font-medium text-content">
            {t('booking.payment.disputeReason' as MessageKey)}
          </label>
          <textarea
            id="dispute-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded-lg bg-surface border border-hairline p-3 text-content text-sm"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!showDispute ? (
          <>
            <Button
              onClick={() => respond('confirmed')}
              disabled={submitting}
              className="min-h-11"
            >
              {t('booking.payment.confirm' as MessageKey)}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowDispute(true)}
              disabled={submitting}
              className="min-h-11"
            >
              {t('booking.payment.dispute' as MessageKey)}
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            onClick={() => respond('disputed')}
            disabled={submitting}
            className="min-h-11 border-error/50 text-error"
          >
            {t('booking.payment.disputeSubmit' as MessageKey)}
          </Button>
        )}
      </div>
    </div>
  );
}

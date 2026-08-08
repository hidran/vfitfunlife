'use client';

/**
 * "Pagamento ricevuto" — the trainer records a payment the client made off-platform.
 *
 * The platform does not process the money in the pilot; it only records that it happened,
 * so this is an attestation, not a transaction. The amount is prefilled from the booking's
 * finalPrice but stays editable, because what was actually handed over can differ from the
 * listed price. The server revalidates it regardless.
 */

import { useState } from 'react';
import { Euro, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';
import type { PaymentConfirmationMethod } from '@/types/firebase';
import type { MessageKey } from '@/i18n/messages';

const METHODS: PaymentConfirmationMethod[] = ['cash', 'satispay', 'bank_transfer', 'other'];

interface RecordPaymentSheetProps {
  /** Prefill, taken from the booking's finalPrice. */
  defaultAmount: number;
  onSubmit: (method: PaymentConfirmationMethod, amount: number) => Promise<void>;
  onClose: () => void;
}

export function RecordPaymentSheet({ defaultAmount, onSubmit, onClose }: RecordPaymentSheetProps) {
  const { t } = useI18n();
  const [method, setMethod] = useState<PaymentConfirmationMethod>('cash');
  const [amount, setAmount] = useState(String(defaultAmount ?? ''));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = Number(amount.replace(',', '.'));
  const valid = Number.isFinite(parsed) && parsed > 0;

  const handleSubmit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(method, parsed);
      onClose();
    } catch {
      setError(t('provider.payment.error' as MessageKey));
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-payment-title"
    >
      <div className="w-full sm:max-w-md bg-surface-elevated rounded-t-2xl sm:rounded-2xl border border-hairline p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="record-payment-title" className="text-lg font-semibold text-content">
              {t('provider.payment.title' as MessageKey)}
            </h2>
            <p className="text-sm text-content-muted mt-1">
              {t('provider.payment.subtitle' as MessageKey)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('provider.payment.cancel' as MessageKey)}
            className="w-11 h-11 -mr-2 -mt-2 flex items-center justify-center rounded-lg text-content-muted hover:text-content"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-content mb-2">
            {t('provider.payment.method' as MessageKey)}
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                aria-pressed={method === m}
                className={cn(
                  'min-h-11 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
                  method === m
                    ? 'border-[var(--section-primary)] bg-[var(--section-primary)]/10 text-content'
                    : 'border-hairline text-content-muted hover:text-content',
                )}
              >
                {t(`provider.payment.method.${m}` as MessageKey)}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          <label htmlFor="payment-amount" className="text-sm font-medium text-content">
            {t('provider.payment.amount' as MessageKey)}
          </label>
          <div className="relative">
            <Euro className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
            <input
              id="payment-amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full min-h-11 pl-9 pr-3 py-2 rounded-lg bg-surface border border-hairline text-content"
            />
          </div>
        </div>

        {error && <p className="text-sm text-error">{error}</p>}

        <div className="flex gap-3 pt-1">
          <Button variant="outline" onClick={onClose} className="flex-1 min-h-11">
            {t('provider.payment.cancel' as MessageKey)}
          </Button>
          <Button onClick={handleSubmit} disabled={!valid || submitting} className="flex-1 min-h-11">
            {t('provider.payment.submit' as MessageKey)}
          </Button>
        </div>
      </div>
    </div>
  );
}

'use client';

/**
 * Trainer-side "cancel this booking" confirmation, with an optional reason.
 *
 * Replaces a bare window.confirm, which gave the trainer no way to tell the client why.
 * The reason travels through cancelBooking → cancelBookingAsTrainer (as `note`) and ends
 * up in the client's cancellation notification. Shared by the bookings list and the
 * booking detail screen.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';

export const CANCEL_REASON_MAX_LENGTH = 500;

interface CancelBookingDialogProps {
  open: boolean;
  onClose: () => void;
  /** Receives the trimmed reason, or undefined when the trainer left it empty. */
  onConfirm: (reason?: string) => Promise<void> | void;
}

export function CancelBookingDialog({ open, onClose, onConfirm }: CancelBookingDialogProps) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const reasonId = useId();
  const counterId = useId();
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const handleClose = () => {
    if (busy) return;
    setReason('');
    onClose();
  };

  // Escape closes; focus goes back to whatever opened the dialog.
  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      returnFocusRef.current?.focus?.();
    };
    // handleClose only reads `busy`; re-binding on each render is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const trimmed = reason.trim();
      await onConfirm(trimmed ? trimmed : undefined);
      setReason('');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full sm:max-w-md bg-surface-elevated rounded-t-2xl sm:rounded-2xl border border-hairline p-6 space-y-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-content">
              {t('provider.cancelDialog.title')}
            </h2>
            <p id={descriptionId} className="text-sm text-content-muted mt-1">
              {t('provider.cancelDialog.description')}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            aria-label={t('common.close')}
            className="w-11 h-11 -mr-2 -mt-2 flex items-center justify-center rounded-lg text-content-muted hover:text-content disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2">
          <label htmlFor={reasonId} className="text-sm font-medium text-content">
            {t('provider.cancelDialog.reasonLabel')}
          </label>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, CANCEL_REASON_MAX_LENGTH))}
            maxLength={CANCEL_REASON_MAX_LENGTH}
            rows={4}
            autoFocus
            aria-describedby={counterId}
            placeholder={t('provider.cancelDialog.reasonPlaceholder')}
            className="w-full rounded-lg bg-surface border border-hairline px-3 py-2 text-content resize-none"
          />
          <p id={counterId} className="text-xs text-content-muted text-right" aria-live="polite">
            {t('provider.cancelDialog.counter', { count: reason.length, max: CANCEL_REASON_MAX_LENGTH })}
          </p>
        </div>

        <div className="flex gap-3 pt-1">
          <Button variant="outline" onClick={handleClose} disabled={busy} className="flex-1 min-h-11">
            {t('provider.cancelDialog.back')}
          </Button>
          <Button
            variant="secondary"
            onClick={handleConfirm}
            disabled={busy}
            isLoading={busy}
            className="flex-1 min-h-11 border-red-600 bg-red-600 text-white hover:bg-red-700"
          >
            {t('provider.cancelDialog.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}

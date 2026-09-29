'use client';

/**
 * The bottom sheet (dialog on wider screens) the /provider/schedule actions open. Same shell
 * as CancelBookingDialog / RecordPaymentSheet: z-[60] so it sits over the app chrome, 44px
 * targets, Escape and backdrop close, focus returns to whatever opened it.
 */

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';

interface ScheduleSheetProps {
  title: string;
  description?: ReactNode;
  /** While true, closing is ignored (a save is in flight). */
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}

export function ScheduleSheet({ title, description, busy = false, onClose, children, footer }: ScheduleSheetProps) {
  const { t } = useI18n();
  const titleId = useId();
  const descriptionId = useId();
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    busyRef.current = busy;
    onCloseRef.current = onClose;
  }, [busy, onClose]);

  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyRef.current) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      returnFocusRef.current?.focus?.();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-surface-elevated rounded-t-2xl sm:rounded-2xl border border-hairline p-6 space-y-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-content">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="text-sm text-content-muted mt-1">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={t('common.close')}
            className="w-11 h-11 -mr-2 -mt-2 shrink-0 flex items-center justify-center rounded-lg text-content-muted hover:text-content disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {children}

        <div className="flex gap-3 pt-1">{footer}</div>
      </div>
    </div>
  );
}

/** Shared field styling: 44px tall, full width. */
export const fieldClass =
  'w-full min-h-11 rounded-lg bg-surface border border-hairline px-3 py-2 text-content disabled:opacity-60';

/** The message of a callable error (FirebaseError keeps the server's HttpsError message). */
export function callableErrorMessage(err: unknown): string {
  return typeof err === 'object' && err !== null && typeof (err as { message?: unknown }).message === 'string'
    ? (err as { message: string }).message
    : '';
}

'use client';
import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase/config';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { AlertTriangle, X } from 'lucide-react';
import { useEntityMutation } from '@/components/admin';

interface Props {
  open: boolean;
  paymentId: string;
  maxAmount: number;
  onClose: () => void;
}

export function RefundDialog({ open, paymentId, maxAmount, onClose }: Props) {
  const { t } = useI18n();
  const [amount, setAmount] = useState(maxAmount);
  const [reason, setReason] = useState('');
  const refundMut = useEntityMutation<
    { amount: number; reason: string },
    { ok: boolean; refundId?: string }
  >({
    mutate: async ({ amount, reason }) => {
      const fn = httpsCallable<
        { paymentId: string; amount: number; reason: string },
        { ok: boolean; refundId?: string }
      >(functions, 'adminIssueRefund');
      const res = await fn({ paymentId, amount, reason });
      return res.data;
    },
    audit: ({ amount, reason }) => ({
      action: 'refund',
      entityType: 'payment',
      entityId: paymentId,
      after: { amount },
      reason,
    }),
    invalidateKeys: [['transactions']],
    onSuccess: () => onClose(),
  });
  if (!open) return null;
  const valid = amount > 0 && amount <= maxAmount && reason.trim().length > 0;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl bg-[#1E2230] border border-white/10 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <AlertTriangle className="h-5 w-5 text-yellow-400" />
            {t('admin.payments.refund.title')}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="text-white/60 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <label className="block space-y-1">
          <span className="text-xs text-white/60">
            {t('admin.payments.refund.amountLabel')} (max {maxAmount.toFixed(2)})
          </span>
          <input
            type="number"
            step="0.01"
            min={0}
            max={maxAmount}
            value={amount}
            onChange={(e) => setAmount(parseFloat(e.target.value))}
            className="admin-input"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-white/60">
            {t('admin.payments.refund.reasonLabel')}
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="admin-input"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={refundMut.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => refundMut.mutate({ amount, reason })}
            disabled={!valid || refundMut.isPending}
            isLoading={refundMut.isPending}
            className="bg-yellow-500 hover:bg-yellow-600"
          >
            {t('admin.payments.refund.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}

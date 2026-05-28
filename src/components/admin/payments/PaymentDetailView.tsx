'use client';
import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import {
  EntityDetailLayout,
  SuperadminOnly,
  useEntityMutation,
} from '@/components/admin';
import { PaymentFormView, type PaymentFormData } from './PaymentFormView';
import { RefundDialog } from './RefundDialog';
import type { AdminTransaction } from '@/types/admin';
import { useI18n } from '@/hooks/useI18n';
import { formatPrice } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';

interface PaymentDoc extends AdminTransaction {
  notes?: string;
  disputed?: boolean;
}

// Canonical Firestore collection for the payments ledger (see
// src/lib/firebase/admin.ts → TRANSACTIONS_COLLECTION).
const COLLECTION = 'transactions';

export function PaymentDetailView({ paymentId }: { paymentId: string }) {
  const { t } = useI18n();
  const [payment, setPayment] = useState<PaymentDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const snap = await getDoc(doc(db, COLLECTION, paymentId));
      if (cancelled) return;
      setPayment(snap.exists() ? ({ id: snap.id, ...snap.data() } as PaymentDoc) : null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [paymentId]);

  const updateMut = useEntityMutation<PaymentFormData, void>({
    mutate: async (data) => {
      await updateDoc(doc(db, COLLECTION, paymentId), {
        notes: data.notes ?? null,
        disputed: data.disputed ?? false,
      });
    },
    audit: (data) => ({
      action: 'update',
      entityType: 'payment',
      entityId: paymentId,
      before: (payment ?? undefined) as Record<string, unknown> | undefined,
      after: data as unknown as Record<string, unknown>,
    }),
    invalidateKeys: [['transactions']],
    onSuccess: (_r, data) => {
      setPayment((p) =>
        p
          ? { ...p, notes: data.notes ?? undefined, disputed: data.disputed }
          : p,
      );
      setEditing(false);
    },
  });

  if (loading) return <div className="p-8 text-white/50">{t('common.loading')}</div>;
  if (!payment) return <div className="p-8 text-white/50">{t('admin.payments.notFound')}</div>;

  return (
    <>
      <EntityDetailLayout
        title={`${t('admin.payments.entityLabel')} #${payment.id.slice(0, 8)}`}
        subtitle={`${formatPrice(payment.amount)} • ${payment.status}`}
        backHref="/admin/payments/"
        isEditing={editing}
        isSaving={updateMut.isPending}
        onEdit={() => setEditing(true)}
        onCancelEdit={() => setEditing(false)}
        onSave={() =>
          (document.getElementById('payment-form') as HTMLFormElement | null)?.requestSubmit()
        }
      >
        <div className="space-y-6">
          {/* Display-only summary */}
          <div className="grid grid-cols-2 gap-4 rounded-2xl border border-white/10 bg-[#1E2230] p-4 text-sm">
            <div>
              <span className="text-white/50">{t('admin.payments.field.customer')}</span>
              <div className="text-white">{payment.customerName ?? '—'}</div>
            </div>
            <div>
              <span className="text-white/50">{t('admin.payments.field.provider')}</span>
              <div className="text-white">{payment.providerName ?? '—'}</div>
            </div>
            <div>
              <span className="text-white/50">{t('admin.payments.field.amount')}</span>
              <div className="text-white">{formatPrice(payment.amount)}</div>
            </div>
            <div>
              <span className="text-white/50">{t('admin.payments.field.status')}</span>
              <div className="text-white">{payment.status}</div>
            </div>
            <div className="col-span-2">
              <span className="text-white/50">{t('admin.payments.field.stripeId')}</span>
              <div className="text-white font-mono text-xs">
                {payment.stripePaymentIntentId ?? '—'}
              </div>
            </div>
          </div>

          <PaymentFormView
            mode={editing ? 'edit' : 'view'}
            initial={payment}
            onSubmit={(d) => updateMut.mutate(d)}
          />

          <SuperadminOnly>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setRefundOpen(true)}
              className="text-yellow-400 hover:text-yellow-400"
            >
              <RotateCcw className="mr-1 h-4 w-4" />
              {t('admin.payments.action.refund')}
            </Button>
          </SuperadminOnly>
        </div>
      </EntityDetailLayout>
      <RefundDialog
        open={refundOpen}
        paymentId={paymentId}
        maxAmount={payment.amount}
        onClose={() => setRefundOpen(false)}
      />
    </>
  );
}

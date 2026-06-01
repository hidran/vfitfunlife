'use client';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { SuperadminOnly } from '@/components/admin';
import { useI18n } from '@/hooks/useI18n';

const paymentSchema = z.object({
  notes: z.string().optional().or(z.literal('')),
  disputed: z.boolean(),
});

export type PaymentFormData = z.infer<typeof paymentSchema>;

interface Props {
  mode: 'view' | 'edit';
  initial?: { notes?: string; disputed?: boolean };
  onSubmit: (data: PaymentFormData) => void;
}

export function PaymentFormView({ mode, initial, onSubmit }: Props) {
  const { t } = useI18n();
  const { register, handleSubmit, reset } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { notes: initial?.notes ?? '', disputed: initial?.disputed ?? false },
  });
  useEffect(() => {
    reset({ notes: initial?.notes ?? '', disputed: initial?.disputed ?? false });
  }, [initial, reset]);
  const readonly = mode === 'view';
  return (
    <SuperadminOnly
      fallback={
        <div className="text-xs text-content-faint italic">
          {t('admin.payments.superadminOnlyEdits')}
        </div>
      }
    >
      <form id="payment-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <label className="block space-y-1">
          <span className="text-xs text-content-muted">{t('admin.payments.field.notes')}</span>
          <textarea
            {...register('notes')}
            disabled={readonly}
            rows={3}
            className="admin-input"
          />
        </label>
        <label className="flex items-center gap-2 text-content">
          <input type="checkbox" {...register('disputed')} disabled={readonly} />
          <span>{t('admin.payments.field.disputed')}</span>
        </label>
      </form>
    </SuperadminOnly>
  );
}

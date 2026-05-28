'use client';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useI18n } from '@/hooks/useI18n';
import { SuperadminOnly } from '@/components/admin';
import { formatPrice, toDate } from '@/lib/utils';
import type { Booking } from '@/types/firebase';

const bookingSchema = z.object({
  notes: z.string().optional().or(z.literal('')),
  finalPrice: z.number().positive(),
  scheduledAt: z.string().min(1),
  userId: z.string().min(1),
});

export type BookingFormData = z.infer<typeof bookingSchema>;

interface Props {
  mode: 'view' | 'edit' | 'create';
  initial?: Partial<Booking>;
  onSubmit: (data: BookingFormData) => void;
}

/**
 * Convert a Firestore Timestamp / Date / string into a value that an
 * `<input type="datetime-local" />` will accept (YYYY-MM-DDTHH:mm).
 */
function toLocalDateTimeInput(
  value: Booking['scheduledAt'] | string | undefined,
): string {
  if (!value) return '';
  const d = toDate(value as unknown as Parameters<typeof toDate>[0]);
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function BookingFormView({ mode, initial, onSubmit }: Props) {
  const { t } = useI18n();

  const defaults: BookingFormData = {
    notes:
      (initial as { internalNotes?: string | null })?.internalNotes ??
      initial?.userNotes ??
      '',
    finalPrice: initial?.finalPrice ?? 0,
    scheduledAt: toLocalDateTimeInput(initial?.scheduledAt),
    userId: initial?.userId ?? '',
  };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BookingFormData>({
    resolver: zodResolver(bookingSchema),
    defaultValues: defaults,
  });

  useEffect(() => {
    reset(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const readonly = mode === 'view';

  return (
    <form
      id="booking-form"
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6"
    >
      {/* Display-only customer / venue / service info */}
      <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <ReadOnlyField
          label={t('admin.bookings.field.customer')}
          value={initial?.userName ?? '—'}
          sub={initial?.userEmail ?? initial?.userPhone ?? undefined}
        />
        <ReadOnlyField
          label={t('admin.bookings.field.venue')}
          value={initial?.venueName ?? '—'}
          sub={initial?.venueAddress ?? undefined}
        />
        <ReadOnlyField
          label={t('admin.bookings.field.service')}
          value={initial?.serviceName ?? '—'}
          sub={initial?.instructorName ?? undefined}
        />
        <ReadOnlyField
          label={t('admin.bookings.field.originalPrice')}
          value={formatPrice(initial?.originalPrice ?? 0)}
          sub={
            initial?.discountAmount && initial.discountAmount > 0
              ? `${t('admin.bookings.field.discount')}: ${formatPrice(initial.discountAmount)}`
              : undefined
          }
        />
      </div>

      {/* Editable fields */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field
          label={t('admin.bookings.field.notes')}
          error={errors.notes?.message}
          className="md:col-span-2"
        >
          <textarea
            {...register('notes')}
            disabled={readonly}
            rows={3}
            className="admin-input"
          />
        </Field>

        {/* Superadmin-only: financial / attribution edits */}
        <SuperadminOnly>
          <Field
            label={t('admin.bookings.field.finalPrice')}
            error={errors.finalPrice?.message}
          >
            <input
              type="number"
              step="0.01"
              {...register('finalPrice', { valueAsNumber: true })}
              disabled={readonly}
              className="admin-input"
            />
          </Field>
        </SuperadminOnly>

        <SuperadminOnly>
          <Field
            label={t('admin.bookings.field.scheduledAt')}
            error={errors.scheduledAt?.message}
          >
            <input
              type="datetime-local"
              {...register('scheduledAt')}
              disabled={readonly}
              className="admin-input"
            />
          </Field>
        </SuperadminOnly>

        <SuperadminOnly>
          <Field
            label={t('admin.bookings.field.userId')}
            error={errors.userId?.message}
            className="md:col-span-2"
          >
            <input
              {...register('userId')}
              disabled={readonly}
              className="admin-input"
              placeholder="uid"
            />
          </Field>
        </SuperadminOnly>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
  className,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block space-y-1 ${className ?? ''}`}>
      <span className="text-xs text-white/60">{label}</span>
      {children}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </label>
  );
}

function ReadOnlyField({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <p className="text-xs text-white/40">{label}</p>
      <p className="text-sm text-white">{value}</p>
      {sub && <p className="text-xs text-white/50">{sub}</p>}
    </div>
  );
}

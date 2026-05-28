'use client';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useI18n } from '@/hooks/useI18n';
import type { Venue } from '@/types/firebase';

const venueSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['gym', 'wellness_center', 'beauty_salon', 'outdoor_space', 'event_space']),
  street: z.string().min(1),
  city: z.string().min(1),
  zipCode: z.string().min(1),
  country: z.string().min(1),
  isActive: z.boolean(),
  isPartner: z.boolean(),
});

export type VenueFormData = z.infer<typeof venueSchema>;

interface Props {
  mode: 'view' | 'edit' | 'create';
  initial?: Partial<Venue>;
  onSubmit: (data: VenueFormData) => void;
}

export function VenueFormView({ mode, initial, onSubmit }: Props) {
  const { t } = useI18n();
  const rawAddress = initial?.address as unknown;
  const addrObj =
    rawAddress && typeof rawAddress === 'object'
      ? (rawAddress as { street?: string; city?: string; zipCode?: string; country?: string })
      : null;
  const defaults: VenueFormData = {
    name: initial?.name ?? '',
    type: (initial?.type as VenueFormData['type']) ?? 'gym',
    street: addrObj?.street ?? (typeof rawAddress === 'string' ? rawAddress : '') ?? '',
    city: addrObj?.city ?? (initial as { city?: string })?.city ?? '',
    zipCode: addrObj?.zipCode ?? '',
    country: addrObj?.country ?? 'IT',
    isActive: initial?.isActive ?? true,
    isPartner: initial?.isPartner ?? false,
  };
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<VenueFormData>({
    resolver: zodResolver(venueSchema),
    defaultValues: defaults,
  });
  useEffect(() => {
    reset(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);
  const readonly = mode === 'view';
  return (
    <form
      id="venue-form"
      onSubmit={handleSubmit(onSubmit)}
      className="grid grid-cols-1 gap-4 md:grid-cols-2"
    >
      <Field label={t('admin.venues.field.name')} error={errors.name?.message}>
        <input {...register('name')} disabled={readonly} className="admin-input" />
      </Field>
      <Field label={t('admin.venues.field.type')} error={errors.type?.message}>
        <select {...register('type')} disabled={readonly} className="admin-input">
          <option value="gym">Gym</option>
          <option value="wellness_center">Wellness Center</option>
          <option value="beauty_salon">Beauty Salon</option>
          <option value="outdoor_space">Outdoor</option>
          <option value="event_space">Event Space</option>
        </select>
      </Field>
      <Field label={t('admin.venues.field.street')} error={errors.street?.message}>
        <input {...register('street')} disabled={readonly} className="admin-input" />
      </Field>
      <Field label={t('admin.venues.field.city')} error={errors.city?.message}>
        <input {...register('city')} disabled={readonly} className="admin-input" />
      </Field>
      <Field label={t('admin.venues.field.zipCode')} error={errors.zipCode?.message}>
        <input {...register('zipCode')} disabled={readonly} className="admin-input" />
      </Field>
      <Field label={t('admin.venues.field.country')} error={errors.country?.message}>
        <input {...register('country')} disabled={readonly} className="admin-input" />
      </Field>
      <Field label={t('admin.venues.field.isActive')}>
        <label className="flex items-center gap-2 text-white">
          <input type="checkbox" {...register('isActive')} disabled={readonly} />
          <span>{t('admin.venues.field.isActive')}</span>
        </label>
      </Field>
      <Field label={t('admin.venues.field.isPartner')}>
        <label className="flex items-center gap-2 text-white">
          <input type="checkbox" {...register('isPartner')} disabled={readonly} />
          <span>{t('admin.venues.field.isPartner')}</span>
        </label>
      </Field>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-white/60">{label}</span>
      {children}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </label>
  );
}

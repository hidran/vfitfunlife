'use client';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useI18n } from '@/hooks/useI18n';
import type { Venue } from '@/types/firebase';
import { isValidLatLng } from '@/lib/providerLocation';
import { VenueLocationPicker } from './VenueLocationPicker';

/** Error message the location refine raises; the form translates it (zod messages are plain strings). */
const LOCATION_REQUIRED = 'location_required';

const venueSchema = z
  .object({
    name: z.string().min(1),
    type: z.enum(['gym', 'school', 'studio', 'wellness_center', 'spa', 'beauty_salon', 'outdoor_space', 'event_space']),
    street: z.string().min(1),
    city: z.string().min(1),
    zipCode: z.string().min(1),
    country: z.string().min(1),
    // Nullable, not optional: the refine below is what refuses a venue without a pin, with
    // one message on one field instead of two "expected number" errors.
    lat: z.number().nullable(),
    lng: z.number().nullable(),
    isActive: z.boolean(),
    partnerStatus: z.enum(['pending', 'active', 'suspended']),
    memberDiscountPercent: z.number().int().min(0).max(100),
    partnerInstructorExtraPercent: z.number().int().min(0).max(100),
    ownerId: z.string().trim().max(128),
  })
  .superRefine((data, ctx) => {
    if (!isValidLatLng({ lat: data.lat, lng: data.lng })) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lat'], message: LOCATION_REQUIRED });
    }
  });

export type VenueFormData = z.infer<typeof venueSchema>;

/** Coordinates of a submitted form: the refine guarantees they are valid numbers by then. */
export function venueCoordinates(data: VenueFormData): { lat: number; lng: number } {
  return { lat: data.lat as number, lng: data.lng as number };
}

interface Props {
  mode: 'view' | 'edit' | 'create';
  initial?: Partial<Venue>;
  onSubmit: (data: VenueFormData) => void;
}

/** A text field's value as a coordinate: empty is "none", anything non-numeric is NaN (refused by the refine). */
const asCoordinate = (v: unknown): number | null =>
  v === '' || v === null || v === undefined ? null : typeof v === 'number' ? v : Number(v);

export function VenueFormView({ mode, initial, onSubmit }: Props) {
  const { t } = useI18n();
  // Canonical docs hold a string `address` plus top-level `city` / `zipCode` / `country`. Docs the
  // old admin form saved (and migrate-venue-address.mjs has not repaired yet) hold an object
  // `address`; read both, top-level fields first, the object only as a fallback.
  const rawAddress = initial?.address as unknown;
  const addrObj =
    rawAddress && typeof rawAddress === 'object'
      ? (rawAddress as { street?: string; city?: string; zipCode?: string; country?: string })
      : null;
  // `lat`/`lng` are on the stored document (src/types/venue.ts) but not on the older Venue type
  // the admin views import from types/firebase, hence the cast.
  const flat = (initial ?? {}) as { city?: string; zipCode?: string; country?: string; lat?: unknown; lng?: unknown };
  const initialCoords = isValidLatLng({ lat: flat.lat, lng: flat.lng })
    ? { lat: flat.lat as number, lng: flat.lng as number }
    : { lat: null, lng: null };
  const defaults: VenueFormData = {
    name: initial?.name ?? '',
    type: (initial?.type as VenueFormData['type']) ?? 'gym',
    street: addrObj ? (addrObj.street ?? '') : typeof rawAddress === 'string' ? rawAddress : '',
    city: flat.city || addrObj?.city || '',
    zipCode: flat.zipCode || addrObj?.zipCode || '',
    country: flat.country || addrObj?.country || 'IT',
    ...initialCoords,
    isActive: initial?.isActive ?? true,
    partnerStatus: initial?.partnerStatus ?? 'pending',
    memberDiscountPercent: initial?.memberDiscountPercent ?? 0,
    partnerInstructorExtraPercent: initial?.partnerInstructorExtraPercent ?? 0,
    ownerId: initial?.ownerId ?? '',
  };
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    clearErrors,
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
  const [street, city, zipCode, country, lat, lng] = watch(['street', 'city', 'zipCode', 'country', 'lat', 'lng']);
  const addressQuery = [street, [zipCode, city].filter(Boolean).join(' '), country].filter(Boolean).join(', ');
  const locationError = errors.lat?.message === LOCATION_REQUIRED ? t('admin.venues.field.locationRequired') : undefined;
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
          <option value="gym">{t('admin.venues.filter.gym')}</option>
          <option value="school">{t('admin.venues.filter.school')}</option>
          <option value="studio">{t('admin.venues.filter.studio')}</option>
          <option value="wellness_center">{t('admin.venues.filter.wellnessCenter')}</option>
          <option value="spa">{t('admin.venues.filter.spa')}</option>
          <option value="beauty_salon">{t('admin.venues.filter.beautySalon')}</option>
          <option value="outdoor_space">{t('admin.venues.filter.outdoorSpace')}</option>
          <option value="event_space">{t('admin.venues.filter.eventSpace')}</option>
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

      <fieldset className="space-y-3 md:col-span-2">
        <legend className="text-xs text-content-muted">{t('admin.venues.field.location')}</legend>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('admin.venues.field.lat')}>
            <input
              type="text"
              inputMode="decimal"
              {...register('lat', { setValueAs: asCoordinate })}
              disabled={readonly}
              className="admin-input min-h-[44px]"
            />
          </Field>
          <Field label={t('admin.venues.field.lng')}>
            <input
              type="text"
              inputMode="decimal"
              {...register('lng', { setValueAs: asCoordinate })}
              disabled={readonly}
              className="admin-input min-h-[44px]"
            />
          </Field>
        </div>
        <VenueLocationPicker
          value={{ lat, lng }}
          addressQuery={addressQuery}
          readonly={readonly}
          error={locationError}
          onChange={(point, geocodedCity) => {
            setValue('lat', point.lat, { shouldDirty: true });
            setValue('lng', point.lng, { shouldDirty: true });
            clearErrors('lat');
            if (geocodedCity && !getValues('city').trim()) setValue('city', geocodedCity, { shouldDirty: true });
          }}
        />
      </fieldset>

      <Field label={t('admin.venues.field.isActive')}>
        <label className="flex items-center gap-2 text-content">
          <input type="checkbox" {...register('isActive')} disabled={readonly} />
          <span>{t('admin.venues.field.isActive')}</span>
        </label>
      </Field>
      <Field label={t('gym.partnerStatus')}>
        <select {...register('partnerStatus')} disabled={readonly} className="admin-input">
          <option value="pending">{t('gym.pending')}</option>
          <option value="active">{t('gym.active')}</option>
          <option value="suspended">{t('gym.suspended')}</option>
        </select>
      </Field>
      <Field label={t('gym.ownerId')} error={errors.ownerId?.message}>
        <input {...register('ownerId')} disabled={readonly} className="admin-input" />
      </Field>
      <Field label={t('gym.memberDiscount')} error={errors.memberDiscountPercent?.message}>
        <input type="number" min="0" max="100" {...register('memberDiscountPercent', { valueAsNumber: true })} disabled={readonly} className="admin-input" />
      </Field>
      <Field label={t('gym.instructorDiscount')} error={errors.partnerInstructorExtraPercent?.message}>
        <input type="number" min="0" max="100" {...register('partnerInstructorExtraPercent', { valueAsNumber: true })} disabled={readonly} className="admin-input" />
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
      <span className="text-xs text-content-muted">{label}</span>
      {children}
      {error && <span className="text-xs text-red-400 light:text-red-700">{error}</span>}
    </label>
  );
}

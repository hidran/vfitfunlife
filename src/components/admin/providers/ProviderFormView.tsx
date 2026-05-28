'use client';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { User } from '@/types/firebase';
import { useI18n } from '@/hooks/useI18n';

const providerSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  bio: z.string().optional().or(z.literal('')),
  professionalBio: z.string().optional().or(z.literal('')),
  specialties: z.string().optional().or(z.literal('')),
  // Stored as string for RHF; parent parses to number on submit.
  yearsOfExperience: z.string().optional().or(z.literal('')),
});

export type ProviderFormData = z.infer<typeof providerSchema>;

interface Props {
  mode: 'view' | 'edit' | 'create';
  initial?: Partial<User>;
  onSubmit: (data: ProviderFormData) => void;
}

export function ProviderFormView({ mode, initial, onSubmit }: Props) {
  const { t } = useI18n();
  const profile = initial?.providerProfile ?? null;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ProviderFormData>({
    resolver: zodResolver(providerSchema),
    defaultValues: {
      fullName: initial?.fullName ?? '',
      email: initial?.email ?? '',
      phone: initial?.phone ?? '',
      bio: initial?.bio ?? '',
      professionalBio: profile?.professionalBio ?? '',
      specialties: profile?.specialties?.join(', ') ?? '',
      yearsOfExperience: String(profile?.yearsOfExperience ?? 0),
    },
  });

  useEffect(() => {
    const p = initial?.providerProfile ?? null;
    reset({
      fullName: initial?.fullName ?? '',
      email: initial?.email ?? '',
      phone: initial?.phone ?? '',
      bio: initial?.bio ?? '',
      professionalBio: p?.professionalBio ?? '',
      specialties: p?.specialties?.join(', ') ?? '',
      yearsOfExperience: String(p?.yearsOfExperience ?? 0),
    });
  }, [initial, reset]);

  const readonly = mode === 'view';

  return (
    <form
      id="provider-form"
      onSubmit={handleSubmit(onSubmit)}
      className="grid grid-cols-1 gap-4 md:grid-cols-2"
    >
      <Field
        label={t('admin.providers.field.fullName')}
        error={errors.fullName?.message}
      >
        <input {...register('fullName')} disabled={readonly} className="admin-input" />
      </Field>
      <Field label={t('admin.providers.field.email')} error={errors.email?.message}>
        <input
          type="email"
          {...register('email')}
          disabled={readonly}
          className="admin-input"
        />
      </Field>
      <Field label={t('admin.providers.field.phone')} error={errors.phone?.message}>
        <input {...register('phone')} disabled={readonly} className="admin-input" />
      </Field>
      <Field
        label={t('admin.providers.field.specialties')}
        error={errors.specialties?.message}
      >
        <input
          {...register('specialties')}
          disabled={readonly}
          placeholder={t('admin.providers.field.specialtiesPlaceholder')}
          className="admin-input"
        />
      </Field>
      <Field
        label={t('admin.providers.field.yearsOfExperience')}
        error={errors.yearsOfExperience?.message}
      >
        <input
          type="number"
          min={0}
          {...register('yearsOfExperience')}
          disabled={readonly}
          className="admin-input"
        />
      </Field>
      <Field label={t('admin.providers.field.bio')} error={errors.bio?.message}>
        <textarea
          {...register('bio')}
          disabled={readonly}
          rows={3}
          className="admin-input md:col-span-2"
        />
      </Field>
      <Field
        label={t('admin.providers.field.professionalBio')}
        error={errors.professionalBio?.message}
      >
        <textarea
          {...register('professionalBio')}
          disabled={readonly}
          rows={4}
          className="admin-input md:col-span-2"
        />
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

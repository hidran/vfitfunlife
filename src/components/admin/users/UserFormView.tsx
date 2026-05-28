'use client';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { User } from '@/types/firebase';
import { useI18n } from '@/hooks/useI18n';

const userSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  bio: z.string().optional().or(z.literal('')),
});

export type UserFormData = z.infer<typeof userSchema>;

interface Props {
  mode: 'view' | 'edit' | 'create';
  initial?: Partial<User>;
  onSubmit: (data: UserFormData) => void;
}

export function UserFormView({ mode, initial, onSubmit }: Props) {
  const { t } = useI18n();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      fullName: initial?.fullName ?? '',
      email: initial?.email ?? '',
      phone: initial?.phone ?? '',
      bio: initial?.bio ?? '',
    },
  });
  useEffect(() => {
    reset({
      fullName: initial?.fullName ?? '',
      email: initial?.email ?? '',
      phone: initial?.phone ?? '',
      bio: initial?.bio ?? '',
    });
  }, [initial, reset]);
  const readonly = mode === 'view';
  return (
    <form id="user-form" onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label={t('admin.users.field.fullName')} error={errors.fullName?.message}>
        <input {...register('fullName')} disabled={readonly} className="admin-input" />
      </Field>
      <Field label={t('admin.users.field.email')} error={errors.email?.message}>
        <input type="email" {...register('email')} disabled={readonly} className="admin-input" />
      </Field>
      <Field label={t('admin.users.field.phone')} error={errors.phone?.message}>
        <input {...register('phone')} disabled={readonly} className="admin-input" />
      </Field>
      <Field label={t('admin.users.field.bio')} error={errors.bio?.message}>
        <textarea {...register('bio')} disabled={readonly} rows={3} className="admin-input md:col-span-2" />
      </Field>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-white/60">{label}</span>
      {children}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </label>
  );
}

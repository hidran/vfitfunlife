'use client';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { SuperadminOnly } from '@/components/admin';
import { useI18n } from '@/hooks/useI18n';
import type { UserType } from '@/types/admin';

const userTypeSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional().or(z.literal('')),
  description: z.string().optional().or(z.literal('')),
  icon: z.string().optional().or(z.literal('')),
  permissions: z.string().optional().or(z.literal('')), // comma-separated
  isActive: z.boolean(),
});

export type UserTypeFormData = z.infer<typeof userTypeSchema>;

interface Props {
  mode: 'view' | 'edit' | 'create';
  initial?: Partial<UserType> & { category?: string };
  onSubmit: (data: UserTypeFormData) => void;
}

export function UserTypeFormView({ mode, initial, onSubmit }: Props) {
  const { t } = useI18n();
  const defaults: UserTypeFormData = {
    name: initial?.name ?? '',
    category: (initial as { category?: string })?.category ?? '',
    description: initial?.description ?? '',
    icon: initial?.icon ?? '',
    permissions: (initial?.requirements ?? []).join(', '),
    isActive: initial?.isActive ?? true,
  };
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UserTypeFormData>({
    resolver: zodResolver(userTypeSchema),
    defaultValues: defaults,
  });
  useEffect(() => {
    reset(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);
  const readonly = mode === 'view';

  return (
    <SuperadminOnly
      fallback={
        <div className="text-xs text-content-faint italic">
          {t('admin.userTypes.superadminOnly')}
        </div>
      }
    >
      <form
        id="user-type-form"
        onSubmit={handleSubmit(onSubmit)}
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
      >
        <Field label={t('admin.userTypes.field.name')} error={errors.name?.message}>
          <input {...register('name')} disabled={readonly} className="admin-input" />
        </Field>
        <Field label={t('admin.userTypes.field.category')} error={errors.category?.message}>
          <input {...register('category')} disabled={readonly} className="admin-input" />
        </Field>
        <Field label={t('admin.userTypes.field.icon')} error={errors.icon?.message}>
          <input {...register('icon')} disabled={readonly} className="admin-input" />
        </Field>
        <Field label={t('admin.userTypes.field.isActive')}>
          <label className="flex items-center gap-2 text-content">
            <input type="checkbox" {...register('isActive')} disabled={readonly} />
            <span>{t('admin.userTypes.field.isActive')}</span>
          </label>
        </Field>
        <div className="md:col-span-2">
          <Field
            label={t('admin.userTypes.field.description')}
            error={errors.description?.message}
          >
            <textarea
              {...register('description')}
              disabled={readonly}
              rows={3}
              className="admin-input"
            />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field
            label={t('admin.userTypes.field.permissions')}
            error={errors.permissions?.message}
          >
            <input
              {...register('permissions')}
              disabled={readonly}
              placeholder="read, write, delete"
              className="admin-input"
            />
          </Field>
        </div>
      </form>
    </SuperadminOnly>
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
      {error && <span className="text-xs text-red-400">{error}</span>}
    </label>
  );
}

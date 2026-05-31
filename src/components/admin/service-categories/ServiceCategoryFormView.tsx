'use client';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useI18n } from '@/hooks/useI18n';
import type { ServiceCategoryDoc } from '@/types/admin';

const serviceCategorySchema = z.object({
  name: z.string().min(1),
  icon: z.string().optional().or(z.literal('')),
  order: z.coerce.number(),
  isActive: z.boolean(),
});

type ServiceCategoryFormInput = z.input<typeof serviceCategorySchema>;
export type ServiceCategoryFormData = z.output<typeof serviceCategorySchema>;

interface Props {
  mode: 'view' | 'edit' | 'create';
  initial?: Partial<ServiceCategoryDoc>;
  onSubmit: (data: ServiceCategoryFormData) => void;
}

export function ServiceCategoryFormView({ mode, initial, onSubmit }: Props) {
  const { t } = useI18n();
  const defaults: ServiceCategoryFormInput = {
    name: initial?.name ?? '',
    icon: initial?.icon ?? '',
    order: initial?.order ?? 0,
    isActive: initial?.isActive ?? true,
  };
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ServiceCategoryFormInput, unknown, ServiceCategoryFormData>({
    resolver: zodResolver(serviceCategorySchema),
    defaultValues: defaults,
  });
  useEffect(() => {
    reset(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);
  const readonly = mode === 'view';

  return (
    <form
      id="service-category-form"
      onSubmit={handleSubmit(onSubmit)}
      className="grid grid-cols-1 gap-4 md:grid-cols-2"
    >
      <Field label={t('admin.serviceCategories.field.name')} error={errors.name?.message}>
        <input {...register('name')} disabled={readonly} className="admin-input" />
      </Field>
      <Field label={t('admin.serviceCategories.field.icon')} error={errors.icon?.message}>
        <input {...register('icon')} disabled={readonly} className="admin-input" />
      </Field>
      <Field label={t('admin.serviceCategories.field.order')} error={errors.order?.message}>
        <input
          type="number"
          {...register('order')}
          disabled={readonly}
          className="admin-input"
        />
      </Field>
      <Field label={t('admin.serviceCategories.field.isActive')}>
        <label className="flex items-center gap-2 text-white">
          <input type="checkbox" {...register('isActive')} disabled={readonly} />
          <span>{t('admin.serviceCategories.field.isActive')}</span>
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

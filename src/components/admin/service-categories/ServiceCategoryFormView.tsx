'use client';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useI18n } from '@/hooks/useI18n';
import { useAllServiceCategories } from '@/hooks/useServiceCategories';
import { SUPPORTED_LOCALES } from '@/types/locale';
import type { ServiceCategoryDoc } from '@/types/admin';

const SECTIONS = ['fit', 'fun', 'life'] as const;

/**
 * Labels are a per-locale map, not an i18n key: the catalogue is admin-authored and an
 * admin cannot add a message key at runtime — which is why every category used to render
 * in Italian regardless of the viewer's locale.
 *
 * Only Italian is required. A missing translation falls back to it, which is better than
 * blocking an admin from creating a category until they have five translations to hand.
 */
const serviceCategorySchema = z.object({
  name_it: z.string().min(1),
  name_en: z.string().optional().or(z.literal('')),
  name_es: z.string().optional().or(z.literal('')),
  name_fr: z.string().optional().or(z.literal('')),
  name_de: z.string().optional().or(z.literal('')),
  parentId: z.string().optional().or(z.literal('')),
  sections: z.array(z.string()).min(1),
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
  const { data: all = [] } = useAllServiceCategories();

  // Only groups may be a parent, and a category can never be its own — the tree is two
  // levels by design, and a self-reference would make the ancestry walk cycle.
  const parentOptions = all.filter((c) => c.parentId === null && c.id !== initial?.id);

  const names = (initial?.names ?? {}) as Record<string, string>;
  const defaults: ServiceCategoryFormInput = {
    name_it: names.it ?? initial?.name ?? '',
    name_en: names.en ?? '',
    name_es: names.es ?? '',
    name_fr: names.fr ?? '',
    name_de: names.de ?? '',
    parentId: initial?.parentId ?? '',
    sections: initial?.sections ?? ['fit'],
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
      {SUPPORTED_LOCALES.map((loc) => (
        <Field
          key={loc}
          label={`${t('admin.serviceCategories.field.name')} (${loc.toUpperCase()})`}
          error={errors[`name_${loc}` as keyof typeof errors]?.message as string | undefined}
        >
          <input
            {...register(`name_${loc}` as keyof ServiceCategoryFormInput)}
            disabled={readonly}
            className="admin-input"
          />
        </Field>
      ))}

      <Field label={t('admin.serviceCategories.field.parent')}>
        <select {...register('parentId')} disabled={readonly} className="admin-input">
          <option value="">{t('admin.serviceCategories.field.parentNone')}</option>
          {parentOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.icon} {p.name}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label={t('admin.serviceCategories.field.sections')}
        error={errors.sections?.message as string | undefined}
      >
        <div className="flex gap-3">
          {SECTIONS.map((sec) => (
            <label key={sec} className="flex items-center gap-1.5 text-content">
              <input type="checkbox" value={sec} {...register('sections')} disabled={readonly} />
              <span className="text-sm uppercase">{sec}</span>
            </label>
          ))}
        </div>
      </Field>

      <Field label={t('admin.serviceCategories.field.icon')} error={errors.icon?.message}>
        <input {...register('icon')} disabled={readonly} className="admin-input" />
      </Field>
      <Field label={t('admin.serviceCategories.field.order')} error={errors.order?.message}>
        <input type="number" {...register('order')} disabled={readonly} className="admin-input" />
      </Field>
      <Field label={t('admin.serviceCategories.field.isActive')}>
        <label className="flex items-center gap-2 text-content">
          <input type="checkbox" {...register('isActive')} disabled={readonly} />
          <span>{t('admin.serviceCategories.field.isActive')}</span>
        </label>
      </Field>
    </form>
  );
}

/** Form values -> the stored document shape. */
export function toCategoryNames(form: ServiceCategoryFormData): Record<string, string> {
  const out: Record<string, string> = { it: form.name_it };
  for (const loc of ['en', 'es', 'fr', 'de'] as const) {
    const v = form[`name_${loc}` as const];
    // Fall back to Italian rather than storing an empty string, which would render blank.
    out[loc] = v && v.trim() ? v : form.name_it;
  }
  return out;
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

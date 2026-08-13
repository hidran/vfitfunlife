'use client';
import { useRouter } from 'next/navigation';
import { EntityDetailLayout, useEntityMutation } from '@/components/admin';
import { createServiceCategory as createServiceCategoryFn } from '@/lib/firebase/admin';
import {
  ServiceCategoryFormView,
  toCategoryNames,
  type ServiceCategoryFormData,
} from './ServiceCategoryFormView';
import type { ServiceCategoryData } from '@/types/admin';
import { useI18n } from '@/hooks/useI18n';

function toServiceCategoryData(form: ServiceCategoryFormData): ServiceCategoryData {
  return {
    names: toCategoryNames(form),
    parentId: form.parentId ? form.parentId : null,
    sections: form.sections,
    icon: form.icon ?? '',
    isActive: form.isActive,
    order: form.order,
  };
}

export function ServiceCategoryCreateView() {
  const router = useRouter();
  const { t } = useI18n();

  const createMut = useEntityMutation<ServiceCategoryFormData, string>({
    mutate: async (data) => {
      const id = await createServiceCategoryFn(toServiceCategoryData(data));
      return id;
    },
    audit: (data, id) => ({
      action: 'create',
      entityType: 'service_category',
      entityId: id,
      after: toServiceCategoryData(data) as unknown as Record<string, unknown>,
    }),
    invalidateKeys: [['serviceCategories']],
    onSuccess: (id) => router.replace('/admin/services/?id=' + id),
  });

  return (
    <EntityDetailLayout
      title={t('admin.serviceCategories.addServiceCategory')}
      backHref="/admin/services/"
      isEditing={true}
      isSaving={createMut.isPending}
      onCancelEdit={() => router.push('/admin/services/')}
      onSave={() =>
        (
          document.getElementById('service-category-form') as HTMLFormElement | null
        )?.requestSubmit()
      }
    >
      <ServiceCategoryFormView mode="create" onSubmit={(d) => createMut.mutate(d)} />
    </EntityDetailLayout>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import {
  EntityDetailLayout,
  ConfirmDeleteDialog,
  useEntityMutation,
} from '@/components/admin';
import {
  updateServiceCategory as updateServiceCategoryFn,
  deleteServiceCategory as deleteServiceCategoryFn,
} from '@/lib/firebase/admin';
import {
  ServiceCategoryFormView,
  type ServiceCategoryFormData,
} from './ServiceCategoryFormView';
import type { ServiceCategoryDoc, ServiceCategoryData } from '@/types/admin';
import { useI18n } from '@/hooks/useI18n';

const SERVICE_CATEGORIES_COLLECTION = 'serviceCategories';

function toServiceCategoryData(form: ServiceCategoryFormData): ServiceCategoryData {
  return {
    name: form.name,
    icon: form.icon ?? '',
    isActive: form.isActive,
    order: form.order,
  };
}

export function ServiceCategoryDetailView({
  serviceCategoryId,
}: {
  serviceCategoryId: string;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [sc, setSc] = useState<ServiceCategoryDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const snap = await getDoc(doc(db, SERVICE_CATEGORIES_COLLECTION, serviceCategoryId));
      if (cancelled) return;
      setSc(
        snap.exists() ? ({ id: snap.id, ...snap.data() } as ServiceCategoryDoc) : null,
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [serviceCategoryId]);

  const updateMut = useEntityMutation<ServiceCategoryFormData, void>({
    mutate: async (data) => {
      await updateServiceCategoryFn(serviceCategoryId, toServiceCategoryData(data));
    },
    audit: (data) => ({
      action: 'update',
      entityType: 'service_category',
      entityId: serviceCategoryId,
      before: (sc ?? undefined) as Record<string, unknown> | undefined,
      after: toServiceCategoryData(data) as unknown as Record<string, unknown>,
    }),
    invalidateKeys: [['serviceCategories']],
    onSuccess: (_r, data) => {
      const persisted = toServiceCategoryData(data);
      setSc((prev) =>
        prev
          ? ({
              ...prev,
              ...persisted,
            } as ServiceCategoryDoc)
          : prev,
      );
      setEditing(false);
    },
  });

  const deleteMut = useEntityMutation<{ reason: string }, void>({
    mutate: async () => {
      await deleteServiceCategoryFn(serviceCategoryId);
    },
    audit: ({ reason }) => ({
      action: 'delete',
      entityType: 'service_category',
      entityId: serviceCategoryId,
      before: (sc ?? undefined) as Record<string, unknown> | undefined,
      reason,
    }),
    invalidateKeys: [['serviceCategories']],
    onSuccess: () => router.push('/admin/services/'),
  });

  if (loading) return <div className="p-8 text-content-muted">{t('common.loading')}</div>;
  if (!sc)
    return (
      <div className="p-8 text-content-muted">{t('admin.serviceCategories.notFound')}</div>
    );

  return (
    <>
      <EntityDetailLayout
        title={`${sc.icon} ${sc.name}`}
        subtitle={sc.slug ?? ''}
        backHref="/admin/services/"
        isEditing={editing}
        isSaving={updateMut.isPending}
        onEdit={() => setEditing(true)}
        onCancelEdit={() => setEditing(false)}
        onSave={() =>
          (
            document.getElementById('service-category-form') as HTMLFormElement | null
          )?.requestSubmit()
        }
        onDelete={() => setConfirmOpen(true)}
      >
        <ServiceCategoryFormView
          mode={editing ? 'edit' : 'view'}
          initial={sc}
          onSubmit={(d) => updateMut.mutate(d)}
        />
      </EntityDetailLayout>
      <ConfirmDeleteDialog
        open={confirmOpen}
        entityLabel={t('admin.serviceCategories.entityLabel')}
        entityName={sc.name}
        onClose={() => setConfirmOpen(false)}
        onConfirm={(reason) => deleteMut.mutateAsync({ reason })}
      />
    </>
  );
}

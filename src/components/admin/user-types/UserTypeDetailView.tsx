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
  updateUserType as updateUserTypeFn,
  deleteUserType as deleteUserTypeFn,
} from '@/lib/firebase/admin';
import { UserTypeFormView, type UserTypeFormData } from './UserTypeFormView';
import type { UserType, UserTypeData } from '@/types/admin';
import { useI18n } from '@/hooks/useI18n';

const USER_TYPES_COLLECTION = 'userTypes';

interface UserTypeDoc extends UserType {
  category?: string;
}

function permissionsStringToArray(input?: string): string[] {
  if (!input) return [];
  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function toUserTypeData(form: UserTypeFormData): UserTypeData & {
  category?: string;
} {
  return {
    name: form.name,
    description: form.description ?? '',
    icon: form.icon ?? '',
    isActive: form.isActive,
    requirements: permissionsStringToArray(form.permissions),
    ...(form.category ? { category: form.category } : {}),
  };
}

export function UserTypeDetailView({ userTypeId }: { userTypeId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [ut, setUt] = useState<UserTypeDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const snap = await getDoc(doc(db, USER_TYPES_COLLECTION, userTypeId));
      if (cancelled) return;
      setUt(snap.exists() ? ({ id: snap.id, ...snap.data() } as UserTypeDoc) : null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userTypeId]);

  const updateMut = useEntityMutation<UserTypeFormData, void>({
    mutate: async (data) => {
      await updateUserTypeFn(userTypeId, toUserTypeData(data) as UserTypeData);
    },
    audit: (data) => ({
      action: 'update',
      entityType: 'user_type',
      entityId: userTypeId,
      before: (ut ?? undefined) as Record<string, unknown> | undefined,
      after: toUserTypeData(data) as unknown as Record<string, unknown>,
    }),
    invalidateKeys: [['userTypes']],
    onSuccess: (_r, data) => {
      const persisted = toUserTypeData(data);
      setUt((prev) =>
        prev
          ? ({
              ...prev,
              ...persisted,
            } as UserTypeDoc)
          : prev,
      );
      setEditing(false);
    },
  });

  const deleteMut = useEntityMutation<{ reason: string }, void>({
    mutate: async () => {
      await deleteUserTypeFn(userTypeId);
    },
    audit: ({ reason }) => ({
      action: 'delete',
      entityType: 'user_type',
      entityId: userTypeId,
      before: (ut ?? undefined) as Record<string, unknown> | undefined,
      reason,
    }),
    invalidateKeys: [['userTypes']],
    onSuccess: () => router.push('/admin/user-types/'),
  });

  if (loading) return <div className="p-8 text-white/50">{t('common.loading')}</div>;
  if (!ut)
    return <div className="p-8 text-white/50">{t('admin.userTypes.notFound')}</div>;

  return (
    <>
      <EntityDetailLayout
        title={ut.name}
        subtitle={ut.category ?? ut.slug ?? ''}
        backHref="/admin/user-types/"
        isEditing={editing}
        isSaving={updateMut.isPending}
        onEdit={() => setEditing(true)}
        onCancelEdit={() => setEditing(false)}
        onSave={() =>
          (document.getElementById('user-type-form') as HTMLFormElement | null)?.requestSubmit()
        }
        onDelete={() => setConfirmOpen(true)}
      >
        <UserTypeFormView
          mode={editing ? 'edit' : 'view'}
          initial={ut}
          onSubmit={(d) => updateMut.mutate(d)}
        />
      </EntityDetailLayout>
      <ConfirmDeleteDialog
        open={confirmOpen}
        entityLabel={t('admin.userTypes.entityLabel')}
        entityName={ut.name}
        onClose={() => setConfirmOpen(false)}
        onConfirm={(reason) => deleteMut.mutateAsync({ reason })}
      />
    </>
  );
}

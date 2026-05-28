'use client';
import { useRouter } from 'next/navigation';
import { EntityDetailLayout, useEntityMutation } from '@/components/admin';
import { createUserType as createUserTypeFn } from '@/lib/firebase/admin';
import { UserTypeFormView, type UserTypeFormData } from './UserTypeFormView';
import type { UserTypeData } from '@/types/admin';
import { useI18n } from '@/hooks/useI18n';

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

export function UserTypeCreateView() {
  const router = useRouter();
  const { t } = useI18n();

  const createMut = useEntityMutation<UserTypeFormData, string>({
    mutate: async (data) => {
      const id = await createUserTypeFn(toUserTypeData(data) as UserTypeData);
      return id;
    },
    audit: (data, id) => ({
      action: 'create',
      entityType: 'user_type',
      entityId: id,
      after: toUserTypeData(data) as unknown as Record<string, unknown>,
    }),
    invalidateKeys: [['userTypes']],
    onSuccess: (id) => router.replace('/admin/user-types/?id=' + id),
  });

  return (
    <EntityDetailLayout
      title={t('admin.userTypes.addUserType')}
      backHref="/admin/user-types/"
      isEditing={true}
      isSaving={createMut.isPending}
      onCancelEdit={() => router.push('/admin/user-types/')}
      onSave={() =>
        (document.getElementById('user-type-form') as HTMLFormElement | null)?.requestSubmit()
      }
    >
      <UserTypeFormView mode="create" onSubmit={(d) => createMut.mutate(d)} />
    </EntityDetailLayout>
  );
}

'use client';
import { useRouter } from 'next/navigation';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useEntityMutation, EntityDetailLayout } from '@/components/admin';
import { useI18n } from '@/hooks/useI18n';
import { UserFormView, type UserFormData } from './UserFormView';

export function UserCreateView() {
  const router = useRouter();
  const { t } = useI18n();
  const createMut = useEntityMutation<UserFormData, string>({
    mutate: async (data) => {
      const ref = await addDoc(collection(db, 'users'), {
        fullName: data.fullName,
        email: data.email || null,
        phone: data.phone || null,
        bio: data.bio || null,
        role: 'customer',
        isVip: false,
        pointsBalance: 0,
        walletBalance: 0,
        createdAt: serverTimestamp(),
      });
      return ref.id;
    },
    audit: (data, id) => ({
      action: 'create',
      entityType: 'user',
      entityId: id,
      after: data,
    }),
    invalidateKeys: [['users']],
    onSuccess: (id) => router.replace('/admin/users/?id=' + id),
  });
  return (
    <EntityDetailLayout
      title={t('admin.users.addUser')}
      backHref="/admin/users/"
      isEditing
      isSaving={createMut.isPending}
      onCancelEdit={() => router.push('/admin/users/')}
      onSave={() => (document.getElementById('user-form') as HTMLFormElement | null)?.requestSubmit()}
    >
      <UserFormView mode="create" onSubmit={(data) => createMut.mutate(data)} />
    </EntityDetailLayout>
  );
}

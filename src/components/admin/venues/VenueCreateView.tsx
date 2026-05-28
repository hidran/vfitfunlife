'use client';
import { useRouter } from 'next/navigation';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { EntityDetailLayout, useEntityMutation } from '@/components/admin';
import { VenueFormView, type VenueFormData } from './VenueFormView';
import { useI18n } from '@/hooks/useI18n';

export function VenueCreateView() {
  const router = useRouter();
  const { t } = useI18n();
  const createMut = useEntityMutation<VenueFormData, string>({
    mutate: async (data) => {
      const ref = await addDoc(collection(db, 'venues'), {
        name: data.name,
        type: data.type,
        isActive: data.isActive,
        isPartner: data.isPartner,
        rating: 0,
        reviewCount: 0,
        photoUrls: [],
        createdAt: serverTimestamp(),
        address: {
          street: data.street,
          city: data.city,
          zipCode: data.zipCode,
          country: data.country,
        },
      });
      return ref.id;
    },
    audit: (data, id) => ({
      action: 'create',
      entityType: 'venue',
      entityId: id,
      after: data as unknown as Record<string, unknown>,
    }),
    invalidateKeys: [['venues']],
    onSuccess: (id) => router.replace('/admin/venues/?id=' + id),
  });
  return (
    <EntityDetailLayout
      title={t('admin.venues.addVenue')}
      backHref="/admin/venues/"
      isEditing={true}
      isSaving={createMut.isPending}
      onCancelEdit={() => router.push('/admin/venues/')}
      onSave={() =>
        (document.getElementById('venue-form') as HTMLFormElement | null)?.requestSubmit()
      }
    >
      <VenueFormView mode="create" onSubmit={(data) => createMut.mutate(data)} />
    </EntityDetailLayout>
  );
}

'use client';
import { useRouter } from 'next/navigation';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useEntityMutation, EntityDetailLayout } from '@/components/admin';
import { useI18n } from '@/hooks/useI18n';
import { ProviderFormView, type ProviderFormData } from './ProviderFormView';

export function ProviderCreateView() {
  const router = useRouter();
  const { t } = useI18n();

  const createMut = useEntityMutation<ProviderFormData, string>({
    mutate: async (data) => {
      const specialties = (data.specialties ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const ref = await addDoc(collection(db, 'users'), {
        fullName: data.fullName,
        email: data.email || null,
        phone: data.phone || null,
        bio: data.bio || null,
        role: 'provider',
        providerStatus: 'pending',
        providerProfile: {
          professionalBio: data.professionalBio || '',
          specialties,
          certifications: [],
          yearsOfExperience: Number(data.yearsOfExperience ?? 0),
          languages: [],
          education: [],
          licenseNumber: null,
          cancellationPolicy: null,
          isVerified: false,
          isActive: true,
          rating: 0,
          reviewCount: 0,
          portfolioImages: [],
          servicePricing: [],
          availabilitySchedule: null,
        },
        isVip: false,
        pointsBalance: 0,
        walletBalance: 0,
        createdAt: serverTimestamp(),
      });
      return ref.id;
    },
    audit: (data, id) => ({
      action: 'create',
      entityType: 'provider',
      entityId: id,
      after: data as Record<string, unknown>,
    }),
    invalidateKeys: [['providers']],
    onSuccess: (id) => router.replace('/admin/providers/?id=' + id),
  });

  return (
    <EntityDetailLayout
      title={t('admin.providers.addProvider')}
      backHref="/admin/providers/"
      isEditing
      isSaving={createMut.isPending}
      onCancelEdit={() => router.push('/admin/providers/')}
      onSave={() =>
        (document.getElementById('provider-form') as HTMLFormElement | null)?.requestSubmit()
      }
    >
      <ProviderFormView mode="create" onSubmit={(data) => createMut.mutate(data)} />
    </EntityDetailLayout>
  );
}

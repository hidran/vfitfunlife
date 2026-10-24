'use client';
import { useRouter } from 'next/navigation';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { EntityDetailLayout, useEntityMutation } from '@/components/admin';
import { VenueFormView, venueCoordinates, type VenueFormData } from './VenueFormView';
import { useI18n } from '@/hooks/useI18n';
import { venueLocationFields } from '@/lib/venueAddress';
import { venueSlug } from '@/lib/slug';
import { DEFAULT_VENUE_HERO_GRADIENTS } from '@/types/venue';

export function VenueCreateView() {
  const router = useRouter();
  const { t } = useI18n();
  const createMut = useEntityMutation<VenueFormData, string>({
    mutate: async (data) => {
      const location = venueLocationFields(data);
      // The full Venue shape (src/types/venue.ts), as functions/src/providers/businessVenue.ts
      // writes it: a venue missing lat/lng is invisible to "near me" search and gives the
      // geohash trigger nothing to sync; the public detail page reads the rest.
      const ref = await addDoc(collection(db, 'venues'), {
        name: data.name,
        slug: venueSlug(data.name, location.city),
        type: data.type,
        isActive: data.isActive,
        isPartner: data.partnerStatus === 'active',
        partnerStatus: data.partnerStatus,
        memberDiscountPercent: data.memberDiscountPercent,
        partnerInstructorExtraPercent: data.partnerInstructorExtraPercent,
        ownerId: data.ownerId,
        rating: 0,
        reviewCount: 0,
        description: '',
        heroGradients: [...DEFAULT_VENUE_HERO_GRADIENTS],
        amenities: [],
        hours: [],
        photoUrls: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...location,
        ...venueCoordinates(data),
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

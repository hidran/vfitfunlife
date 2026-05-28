'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import {
  EntityDetailLayout,
  ConfirmDeleteDialog,
  useEntityMutation,
} from '@/components/admin';
import { VenueFormView, type VenueFormData } from './VenueFormView';
import type { Venue } from '@/types/firebase';
import { useI18n } from '@/hooks/useI18n';

export function VenueDetailView({ venueId }: { venueId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const snap = await getDoc(doc(db, 'venues', venueId));
      if (cancelled) return;
      setVenue(snap.exists() ? ({ id: snap.id, ...snap.data() } as Venue) : null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  const updateMut = useEntityMutation<VenueFormData, void>({
    mutate: async (data) => {
      const patch = {
        name: data.name,
        type: data.type,
        isActive: data.isActive,
        isPartner: data.isPartner,
        address: {
          street: data.street,
          city: data.city,
          zipCode: data.zipCode,
          country: data.country,
        },
      };
      await updateDoc(doc(db, 'venues', venueId), patch);
    },
    audit: (data) => ({
      action: 'update',
      entityType: 'venue',
      entityId: venueId,
      before: (venue ?? undefined) as Record<string, unknown> | undefined,
      after: data as unknown as Record<string, unknown>,
    }),
    invalidateKeys: [['venues']],
    onSuccess: (_r, data) => {
      setVenue((prev) =>
        prev
          ? ({
              ...prev,
              name: data.name,
              type: data.type,
              isActive: data.isActive,
              isPartner: data.isPartner,
              address: {
                street: data.street,
                city: data.city,
                zipCode: data.zipCode,
                country: data.country,
              },
            } as unknown as Venue)
          : prev,
      );
      setEditing(false);
    },
  });

  const deleteMut = useEntityMutation<{ reason: string }, void>({
    mutate: async () => {
      await deleteDoc(doc(db, 'venues', venueId));
    },
    audit: ({ reason }) => ({
      action: 'delete',
      entityType: 'venue',
      entityId: venueId,
      before: (venue ?? undefined) as Record<string, unknown> | undefined,
      reason,
    }),
    invalidateKeys: [['venues']],
    onSuccess: () => router.push('/admin/venues/'),
  });

  if (loading) return <div className="p-8 text-white/50">{t('common.loading')}</div>;
  if (!venue) return <div className="p-8 text-white/50">{t('admin.venues.notFound')}</div>;

  return (
    <>
      <EntityDetailLayout
        title={venue.name}
        subtitle={venue.type}
        backHref="/admin/venues/"
        isEditing={editing}
        isSaving={updateMut.isPending}
        onEdit={() => setEditing(true)}
        onCancelEdit={() => setEditing(false)}
        onSave={() =>
          (document.getElementById('venue-form') as HTMLFormElement | null)?.requestSubmit()
        }
        onDelete={() => setConfirmOpen(true)}
      >
        <VenueFormView
          mode={editing ? 'edit' : 'view'}
          initial={venue}
          onSubmit={(d) => updateMut.mutate(d)}
        />
      </EntityDetailLayout>
      <ConfirmDeleteDialog
        open={confirmOpen}
        entityLabel={t('admin.venues.entityLabel')}
        entityName={venue.name}
        onClose={() => setConfirmOpen(false)}
        onConfirm={(reason) => deleteMut.mutateAsync({ reason })}
      />
    </>
  );
}

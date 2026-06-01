'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase/config';
import {
  EntityDetailLayout,
  ConfirmDeleteDialog,
  StatusBadge,
  useEntityMutation,
} from '@/components/admin';
import { Button } from '@/components/ui/button';
import { BookingFormView, type BookingFormData } from './BookingFormView';
import type { Booking, BookingStatus } from '@/types/firebase';
import { useI18n } from '@/hooks/useI18n';
import { formatDate, toDate } from '@/lib/utils';
import { CheckCircle, XCircle, Flag } from 'lucide-react';

interface Props {
  bookingId: string;
}

export function BookingDetailView({ bookingId }: Props) {
  const router = useRouter();
  const { t } = useI18n();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const snap = await getDoc(doc(db, 'bookings', bookingId));
      if (cancelled) return;
      setBooking(snap.exists() ? ({ id: snap.id, ...snap.data() } as Booking) : null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  const refetch = async () => {
    const snap = await getDoc(doc(db, 'bookings', bookingId));
    setBooking(snap.exists() ? ({ id: snap.id, ...snap.data() } as Booking) : null);
  };

  const updateMut = useEntityMutation<BookingFormData, void>({
    mutate: async (data) => {
      const patch: Record<string, unknown> = {
        internalNotes: data.notes || null,
        finalPrice: data.finalPrice,
        scheduledAt: Timestamp.fromDate(new Date(data.scheduledAt)),
        userId: data.userId,
        updatedAt: serverTimestamp(),
      };
      await updateDoc(doc(db, 'bookings', bookingId), patch);
    },
    audit: (data) => ({
      action: 'update',
      entityType: 'booking',
      entityId: bookingId,
      before: (booking ?? undefined) as Record<string, unknown> | undefined,
      after: data as unknown as Record<string, unknown>,
    }),
    invalidateKeys: [['bookings']],
    onSuccess: async () => {
      await refetch();
      setEditing(false);
    },
  });

  const deleteMut = useEntityMutation<{ reason: string }, void>({
    mutate: async () => {
      await deleteDoc(doc(db, 'bookings', bookingId));
    },
    audit: ({ reason }) => ({
      action: 'delete',
      entityType: 'booking',
      entityId: bookingId,
      before: (booking ?? undefined) as Record<string, unknown> | undefined,
      reason,
    }),
    invalidateKeys: [['bookings']],
    onSuccess: () => router.push('/admin/bookings/'),
  });

  const callStatusFn = async (
    fnName: 'confirmBooking' | 'cancelBooking' | 'updateBookingStatus',
    payload: Record<string, unknown>,
  ) => {
    setStatusBusy(true);
    try {
      const fn = httpsCallable(functions, fnName);
      await fn({ bookingId, ...payload });
      await refetch();
    } catch (err) {
      console.error(`[${fnName}] failed`, err);
      alert((err as Error).message);
    } finally {
      setStatusBusy(false);
    }
  };

  if (loading) return <div className="p-8 text-content-muted">{t('common.loading')}</div>;
  if (!booking) return <div className="p-8 text-content-muted">{t('admin.bookings.notFound')}</div>;

  const status = booking.status as BookingStatus;
  const canConfirm = status === 'pending';
  const canCancel = status === 'pending' || status === 'confirmed' || status === 'in_progress';
  const canComplete = status === 'confirmed' || status === 'in_progress';

  const subtitle = `${booking.serviceName} — ${formatDate(toDate(booking.scheduledAt) || new Date(), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })}`;

  return (
    <>
      <EntityDetailLayout
        title={`#${booking.id.slice(-6).toUpperCase()} — ${booking.userName}`}
        subtitle={subtitle}
        backHref="/admin/bookings/"
        isEditing={editing}
        isSaving={updateMut.isPending}
        onEdit={() => setEditing(true)}
        onCancelEdit={() => setEditing(false)}
        onSave={() =>
          (document.getElementById('booking-form') as HTMLFormElement | null)?.requestSubmit()
        }
        onDelete={() => setConfirmOpen(true)}
      >
        {/* Status + status-action row */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={status as never} />
          <div className="flex-1" />
          {canConfirm && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => callStatusFn('confirmBooking', {})}
              disabled={statusBusy}
              className="flex items-center gap-2 bg-[#10B981] hover:bg-[#059669]"
            >
              <CheckCircle className="w-4 h-4" />
              {t('admin.bookings.action.confirm')}
            </Button>
          )}
          {canComplete && (
            <Button
              variant="primary"
              size="sm"
              onClick={() =>
                callStatusFn('updateBookingStatus', { status: 'completed' })
              }
              disabled={statusBusy}
              className="flex items-center gap-2"
            >
              <Flag className="w-4 h-4" />
              {t('admin.bookings.action.complete')}
            </Button>
          )}
          {canCancel && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const reason = prompt(t('admin.bookings.action.cancelPrompt')) || '';
                if (!reason.trim()) return;
                callStatusFn('cancelBooking', { reason });
              }}
              disabled={statusBusy}
              className="flex items-center gap-2 text-red-400 hover:text-red-400"
            >
              <XCircle className="w-4 h-4" />
              {t('admin.bookings.action.cancel')}
            </Button>
          )}
        </div>

        <BookingFormView
          mode={editing ? 'edit' : 'view'}
          initial={booking}
          onSubmit={(d) => updateMut.mutate(d)}
        />
      </EntityDetailLayout>

      <ConfirmDeleteDialog
        open={confirmOpen}
        entityLabel={t('admin.bookings.entityLabel')}
        entityName={`#${booking.id.slice(-6).toUpperCase()}`}
        onClose={() => setConfirmOpen(false)}
        onConfirm={(reason) => deleteMut.mutateAsync({ reason })}
      />
    </>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/hooks/useI18n';
import { fetchGymBookings, gymCall } from '@/lib/firebase/gym';
import { localDay, sessionTime } from '@/lib/gymTime';
import { Button } from '@/components/ui/button';

export function GymBookings() {
  const uid = useAuthStore(s => s.firebaseUser?.uid);
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['gym', 'bookings', uid], queryFn: () => fetchGymBookings(uid!), enabled: !!uid });
  const [cancelId, setCancelId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const money = (cents: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(cents / 100);
  async function cancel(bookingId: string) {
    setBusy(true); setError('');
    try { await gymCall('cancelGymBooking', { bookingId }); setCancelId('');
      await qc.invalidateQueries({ queryKey: ['gym'] }); }
    catch { setError(t('gym.error')); } finally { setBusy(false); }
  }
  if (!uid) return null;
  return <section id="gym-bookings" className="space-y-3 px-4 py-4">
    <h2 className="text-xl font-semibold text-content">{t('gym.myBookings')}</h2>
    {query.isLoading && <p>{t('common.loading')}</p>}
    {query.isError && <p role="alert">{t('gym.loadError')}</p>}
    {query.data?.length === 0 && <p className="text-sm text-content-muted">{t('gym.noBookings')}</p>}
    <div className="grid gap-3 md:grid-cols-2">{query.data?.map(booking => {
      const cancellable = booking.state === 'confirmed' && booking.startsAt.toMillis() >
        Date.now() + booking.cancellationHours * 3600000;
      return <article key={booking.id} className="space-y-2 rounded-2xl border border-hairline bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold">{booking.title}</h3>
          <span className="text-xs text-content-muted">{t(booking.state === 'cancelled' ? 'gym.cancelled' : 'gym.booked')}</span></div>
        <p className="text-sm">{localDay(booking.startsAt.toDate(), booking.timezone)} · {sessionTime(booking.startsAt.toDate(), locale, booking.timezone)}–{sessionTime(booking.endsAt.toDate(), locale, booking.timezone)}</p>
        <p className="text-sm text-content-muted">{booking.venueName} · {booking.locationName} · {booking.roomName} · {booking.instructorName}</p>
        <p className="text-sm">{t('gym.regularPrice')}: {money(booking.regularPriceCents)} · <strong>{t('gym.finalPrice')}: {booking.finalPriceCents ? money(booking.finalPriceCents) : t('gym.free')}</strong></p>
        <p className="text-sm text-content-muted">{t(booking.paymentStatus === 'paid' ? 'gym.paid' : 'gym.paymentPending')} · {t('gym.direct')}</p>
        {(booking.refundDueCents ?? 0) > 0 && <p className="text-sm">{t('gym.refundDue')}: {money(booking.refundDueCents!)}</p>}
        <div className="flex flex-wrap gap-2"><Link className="inline-flex min-h-11 items-center rounded-xl border border-hairline px-3 text-sm"
          href={`/fit/gyms/timetable?id=${booking.venueId}`}>{t('gym.timetable')}</Link>
          {cancellable && <Button variant="outline" disabled={busy} onClick={() => setCancelId(booking.id)}>{t('gym.cancelBooking')}</Button>}</div>
        {cancelId === booking.id && <div className="flex flex-wrap gap-2 border-t border-hairline pt-3">
          <p className="w-full text-sm">{t('gym.policy', { hours: booking.cancellationHours })}</p>
          <Button disabled={busy} onClick={() => cancel(booking.id)}>{t('gym.cancelBooking')}</Button>
          <Button variant="ghost" onClick={() => setCancelId('')}>{t('common.close')}</Button>
        </div>}
      </article>;
    })}</div>
    {error && <p role="alert" className="text-red-500">{error}</p>}
  </section>;
}

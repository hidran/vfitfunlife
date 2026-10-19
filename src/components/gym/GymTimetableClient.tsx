'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, MapPin, Plus, UserRound } from 'lucide-react';
import { useVenue } from '@/hooks/useVenues';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/stores/authStore';
import { addDays, dayLabel, localDay, sessionTime, weekStart } from '@/lib/gymTime';
import { fetchGymLocations, fetchGymRooms, fetchGymSessions, gymCall } from '@/lib/firebase/gym';
import { db } from '@/lib/firebase/config';
import type { GymQuote, GymSession } from '@/types/gym';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/Modal';

const money = (cents: number, locale: string) => new Intl.NumberFormat(locale, {
  style: 'currency', currency: 'EUR',
}).format(cents / 100);

export function GymTimetableClient() {
  const venueId = useSearchParams().get('id') ?? '';
  const { t, locale } = useI18n();
  const uid = useAuthStore(s => s.firebaseUser?.uid);
  const user = useAuthStore(s => s.user);
  const qc = useQueryClient();
  const venue = useVenue(venueId);
  const staff = useQuery({ queryKey: ['gym', 'staff', uid],
    queryFn: async () => (await getDoc(doc(db, 'venueStaff', uid!))).data() ?? null, enabled: !!uid });
  const canManage = !!uid && (user?.role === 'admin' || user?.role === 'superadmin' ||
    venue.data?.ownerId === uid || (staff.data?.venueId === venueId && staff.data?.isActive !== false));
  const locations = useQuery({ queryKey: ['gym', 'locations', venueId],
    queryFn: () => fetchGymLocations(venueId), enabled: !!venueId });
  const [locationId, setLocationId] = useState('');
  const [roomId, setRoomId] = useState('');
  const location = locations.data?.find(item => item.id === locationId) ?? locations.data?.find(item => item.isActive);
  const rooms = useQuery({ queryKey: ['gym', 'rooms', venueId, location?.id],
    queryFn: () => fetchGymRooms(venueId, location!.id), enabled: !!venueId && !!location?.id });
  const room = rooms.data?.find(item => item.id === roomId) ?? rooms.data?.find(item => item.isActive);
  const timezone = location?.timezone || 'Europe/Rome';
  const today = localDay(new Date(), timezone);
  const [selectedDay, setSelectedDay] = useState('');
  const day = selectedDay || today;
  const week = weekStart(day);
  const sessions = useQuery({ queryKey: ['gym', 'sessions', venueId, week],
    queryFn: () => fetchGymSessions(venueId, week), enabled: !!venueId && !!location?.id &&
      venue.data?.partnerStatus === 'active' && venue.data?.isActive !== false,
    refetchInterval: 30000 });
  const visible = useMemo(() => (sessions.data ?? []).filter(session =>
    session.locationId === location?.id && session.roomId === room?.id &&
    localDay(session.startsAt.toDate(), session.timezone) === day && session.status === 'published')
    .sort((a, b) => a.startsAt.toMillis() - b.startsAt.toMillis()),
  [sessions.data, location?.id, room?.id, day]);
  const prices = useQuery({ queryKey: ['gym', 'prices', visible.map(session => session.id).join(',')],
    queryFn: async () => {
      const ids = visible.map(session => session.id);
      const batches = Array.from({ length: Math.ceil(ids.length / 30) }, (_, index) => ids.slice(index * 30, index * 30 + 30));
      const results = await Promise.all(batches.map(sessionIds => gymCall<{ quotes: Record<string, Pick<GymQuote,
        'regularPriceCents' | 'discountCents' | 'finalPriceCents' | 'gymPercent' | 'instructorPercent'>> }>(
        'quoteGymTimetable', { sessionIds })));
      return { quotes: Object.assign({}, ...results.map(result => result.quotes)) };
    },
    enabled: visible.length > 0, refetchInterval: 30000 });
  const [review, setReview] = useState<{ session: GymSession; quote: GymQuote; requestId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function openReview(session: GymSession) {
    setBusy(true); setError('');
    try {
      const quote = await gymCall<GymQuote>('quoteGymBooking', { sessionId: session.id });
      setReview({ session, quote, requestId: crypto.randomUUID() });
    } catch { setError(t('gym.error')); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (!review) return;
    if (!uid) { window.location.assign('/auth/login'); return; }
    setBusy(true); setError('');
    try {
      await gymCall('bookGymClass', { sessionId: review.session.id,
        expectedFinalPriceCents: review.quote.finalPriceCents,
        expectedRevision: review.quote.revision, requestId: review.requestId });
      setReview(null); setSuccess(t('gym.booked'));
      await qc.invalidateQueries({ queryKey: ['gym'] });
    } catch (cause) {
      if (cause instanceof Error && (cause.message.includes('price_changed_review_again') ||
        cause.message.includes('session_changed_review_again'))) {
        try {
          const quote = await gymCall<GymQuote>('quoteGymBooking', { sessionId: review.session.id });
          setReview({ ...review, quote }); setError(t('gym.priceChanged'));
        } catch { setError(t('gym.error')); }
      } else setError(t('gym.error'));
    }
    finally { setBusy(false); }
  }

  if (!venueId) return <div className="p-6"><Link href="/fit/gyms">{t('gym.selectGym')}</Link></div>;
  return <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 pb-28 md:px-8">
    <header className="space-y-2">
      <Link href={`/venue?id=${venueId}`} className="text-sm text-section-primary">← {venue.data?.name}</Link>
      <h1 className="font-display text-3xl font-bold text-content">{t('gym.timetable')}</h1>
      {canManage && <Link href={`/gym/manage?id=${venueId}`} className="inline-flex min-h-11 items-center rounded-xl border border-hairline px-4 text-sm font-semibold">{t('gym.manage')}</Link>}
      {location && <p className="flex items-center gap-2 text-sm text-content-muted"><MapPin size={16} />{location.address}, {location.city}</p>}
    </header>
    {venue.data && (venue.data.partnerStatus !== 'active' || venue.data.isActive === false) ?
      <p className="rounded-xl border border-hairline bg-surface p-5">{t('gym.partnershipRequired')}</p> : <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">{t('gym.chooseLocation')}
          <select className="w-full rounded-xl border border-hairline bg-surface p-3 text-content" value={location?.id ?? ''}
            onChange={event => { setLocationId(event.target.value); setRoomId(''); setSelectedDay(''); }}>
            {(locations.data ?? []).filter(item => item.isActive).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm">{t('gym.chooseRoom')}
          <select className="w-full rounded-xl border border-hairline bg-surface p-3 text-content" value={room?.id ?? ''}
            onChange={event => setRoomId(event.target.value)}>
            {(rooms.data ?? []).filter(item => item.isActive).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </div>
      <section aria-label={t('gym.timetable')} className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <button type="button" className="grid size-11 place-items-center rounded-xl border border-hairline" aria-label={t('gym.previousWeek')}
            onClick={() => setSelectedDay(addDays(day, -7))}><ChevronLeft size={20} /></button>
          <h2 className="text-center text-lg font-semibold capitalize">{dayLabel(day, locale, { month: 'long', year: 'numeric' })}</h2>
          <button type="button" className="grid size-11 place-items-center rounded-xl border border-hairline" aria-label={t('gym.nextWeek')}
            onClick={() => setSelectedDay(addDays(day, 7))}><ChevronRight size={20} /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {Array.from({ length: 7 }, (_, index) => addDays(week, index)).map(value => <button key={value} type="button"
            aria-pressed={value === day} onClick={() => setSelectedDay(value)}
            className={`min-h-16 rounded-xl border p-1 text-center text-xs sm:p-2 ${value === day ?
              'border-section-primary bg-section-primary/15 text-section-primary' : 'border-hairline bg-surface text-content'}`}>
            <span className="block capitalize">{dayLabel(value, locale, { weekday: 'short' })}</span>
            <span className="block text-lg font-semibold">{dayLabel(value, locale, { day: 'numeric' })}</span>
          </button>)}
        </div>
      </section>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-content">{room?.name || t('gym.chooseRoom')}</h2>
        {(locations.isLoading || rooms.isLoading || sessions.isLoading) && <p>{t('common.loading')}</p>}
        {(locations.isError || rooms.isError || sessions.isError) && <p role="alert">{t('gym.loadError')}</p>}
        {!sessions.isLoading && !sessions.isError && visible.length === 0 && <p className="text-content-muted">{t('gym.noSessions')}</p>}
        <div className="grid gap-4 lg:grid-cols-2">{visible.map(session => {
          const available = Math.max(0, session.capacity - session.booked);
          const closed = available === 0 || session.startsAt.toMillis() <= Date.now() + 2 * 3600000;
          const price = prices.data?.quotes[session.id];
          return <article key={session.id} className="rounded-2xl border border-hairline bg-surface p-4 shadow-sm sm:p-5">
            <div className="flex items-start gap-4">
              <div className="min-w-16 text-center font-semibold text-section-primary">
                <time dateTime={session.startsAt.toDate().toISOString()}>{sessionTime(session.startsAt.toDate(), locale, session.timezone)}</time>
                <span className="block text-xs text-content-muted">{sessionTime(session.endsAt.toDate(), locale, session.timezone)}</span>
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <h3 className="text-lg font-semibold text-content">{session.title}</h3>
                <div className="flex items-center gap-2 text-sm text-content-muted">
                  {session.instructorPhotoUrl ?
                    // Instructor photos can come from provider-managed external URLs.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={session.instructorPhotoUrl} alt="" className="size-8 rounded-full object-cover" /> :
                    <span className="grid size-8 place-items-center rounded-full bg-surface-2"><UserRound size={18} /></span>}
                  <span>{session.instructorName}</span>
                </div>
                <p className="text-sm text-content-muted">{t('gym.available', { count: available, total: session.capacity })}</p>
                <p className="text-sm">{t('gym.regularPrice')}: <strong>{session.regularPriceCents === 0 ? t('gym.free') : money(session.regularPriceCents, locale)}</strong></p>
                {price && <p className="text-sm text-section-primary">{t('gym.finalPrice')}: <strong>{price.finalPriceCents === 0 ? t('gym.free') : money(price.finalPriceCents, locale)}</strong>
                  {price.discountCents > 0 && <span className="ml-2 text-xs text-content-muted">({t('gym.partnerBenefit')})</span>}</p>}
              </div>
              <button type="button" aria-label={t('gym.bookClass')} title={t('gym.bookClass')}
                disabled={closed || busy} onClick={() => openReview(session)}
                className="grid size-11 shrink-0 place-items-center rounded-full bg-section-primary text-white disabled:opacity-40">
                <Plus size={22} aria-hidden="true" />
              </button>
            </div>
          </article>;
        })}</div>
      </section>
    </>}
    {success && <p role="status" className="text-emerald-500">{success} · <Link href="/bookings?tab=gym" className="underline">{t('gym.myBookings')}</Link></p>}
    {error && <p role="alert" className="text-red-500">{error}</p>}
    {review && <Modal onClose={() => !busy && setReview(null)} className="w-full max-w-lg rounded-2xl border border-hairline bg-surface shadow-xl" ariaLabel={t('gym.review')}>
      <div className="space-y-4 p-5 text-content">
        <h2 className="text-2xl font-semibold">{t('gym.review')}</h2>
        <p className="font-medium">{review.quote.title} · {review.quote.roomName}</p>
        <p>{dayLabel(localDay(new Date(review.quote.startsAtMillis), review.quote.timezone), locale,
          { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {sessionTime(new Date(review.quote.startsAtMillis), locale, review.quote.timezone)}–{sessionTime(new Date(review.quote.endsAtMillis), locale, review.quote.timezone)}</p>
        <p>{review.quote.instructorName}</p>
        <dl className="space-y-2 border-y border-hairline py-3">
          <div className="flex justify-between"><dt>{t('gym.regularPrice')}</dt><dd>{money(review.quote.regularPriceCents, locale)}</dd></div>
          {review.quote.gymPercent > 0 && <div className="flex justify-between"><dt>{t('gym.partnerBenefit')} ({review.quote.gymPercent}%)</dt><dd></dd></div>}
          {review.quote.instructorPercent > 0 && <div className="flex justify-between"><dt>{t('gym.instructorBenefit')} ({review.quote.instructorPercent}%)</dt><dd></dd></div>}
          {review.quote.discountCents > 0 && <div className="flex justify-between"><dt>{t('gym.discountAmount')}</dt><dd>−{money(review.quote.discountCents, locale)}</dd></div>}
          <div className="flex justify-between font-bold"><dt>{t('gym.finalPrice')}</dt><dd>{review.quote.finalPriceCents === 0 ? t('gym.free') : money(review.quote.finalPriceCents, locale)}</dd></div>
        </dl>
        <p className="text-sm text-content-muted">{t('gym.available', { count: review.quote.availablePlaces, total: review.quote.capacity })}</p>
        <p className="text-sm text-content-muted">{t('gym.policy', { hours: review.quote.cancellationHours })}</p>
        <p className="text-sm text-content-muted">{t('gym.direct')}</p>
        <div className="flex flex-wrap gap-2"><Button onClick={confirm} disabled={busy || review.quote.availablePlaces < 1}>{uid ? t('gym.confirm') : t('gym.signIn')}</Button>
          <Button variant="ghost" onClick={() => setReview(null)} disabled={busy}>{t('common.close')}</Button></div>
        {error && <p role="alert" className="text-red-500">{error}</p>}
      </div>
    </Modal>}
  </div>;
}

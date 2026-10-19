'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { fetchGymBookings, fetchGymInstructors, fetchGymLocations, fetchGymRooms,
  fetchGymSessions, gymCall } from '@/lib/firebase/gym';
import { useVenue } from '@/hooks/useVenues';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/hooks/useI18n';
import { addDays, localDay, sessionTime, weekStart } from '@/lib/gymTime';
import type { GymSession } from '@/types/gym';
import { Button } from '@/components/ui/button';

const field = 'w-full rounded-xl border border-hairline bg-surface p-3 text-content';

function inputTime(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23' }).formatToParts(date);
  return `${parts.find(p => p.type === 'hour')?.value}:${parts.find(p => p.type === 'minute')?.value}`;
}

export function GymManageClient() {
  const venueId = useSearchParams().get('id') ?? '';
  const { t, locale } = useI18n();
  const user = useAuthStore(s => s.user);
  const uid = useAuthStore(s => s.firebaseUser?.uid);
  const qc = useQueryClient();
  const venue = useVenue(venueId);
  const staff = useQuery({ queryKey: ['gym', 'staff', uid],
    queryFn: async () => (await getDoc(doc(db, 'venueStaff', uid!))).data() ?? null, enabled: !!uid });
  const canManage = !!uid && (user?.role === 'admin' || user?.role === 'superadmin' ||
    venue.data?.ownerId === uid || (staff.data?.venueId === venueId && staff.data?.isActive !== false));
  const locations = useQuery({ queryKey: ['gym', 'locations', venueId],
    queryFn: () => fetchGymLocations(venueId), enabled: !!venueId && canManage });
  const [locationId, setLocationId] = useState('');
  const location = locations.data?.find(item => item.id === locationId) ?? locations.data?.find(item => item.isActive);
  const rooms = useQuery({ queryKey: ['gym', 'rooms', venueId, location?.id],
    queryFn: () => fetchGymRooms(venueId, location!.id), enabled: !!venueId && !!location?.id && canManage });
  const instructors = useQuery({ queryKey: ['gym', 'instructors', venueId],
    queryFn: () => fetchGymInstructors(venueId), enabled: !!venueId && canManage });
  const [roomId, setRoomId] = useState('');
  const room = rooms.data?.find(item => item.id === roomId) ?? rooms.data?.find(item => item.isActive);
  const [week, setWeek] = useState(() => weekStart(localDay(new Date(), 'Europe/Rome')));
  const sessions = useQuery({ queryKey: ['gym', 'manageSessions', venueId, week],
    queryFn: () => fetchGymSessions(venueId, week, true), enabled: !!venueId && canManage });
  const bookings = useQuery({ queryKey: ['gym', 'venueBookings', venueId],
    queryFn: () => fetchGymBookings(uid!, venueId), enabled: !!venueId && canManage && !!uid });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [locationForm, setLocationForm] = useState({ name: '', address: '', city: '', timezone: 'Europe/Rome' });
  const [roomName, setRoomName] = useState('');
  const [editing, setEditing] = useState<GymSession | null>(null);
  const [draft, setDraft] = useState({ title: '', description: '', instructorId: '',
    startDate: addDays(localDay(new Date(), 'Europe/Rome'), 1), startTime: '18:00', endTime: '19:00',
    recurrence: 'none' as 'none' | 'weekly', weekdays: [] as number[], endDate: '',
    capacity: 10, price: '15', cancellationHours: 24, status: 'draft' as 'draft' | 'published' | 'cancelled',
    reason: '', requestId: crypto.randomUUID() });

  async function run(name: string, data: Record<string, unknown>) {
    setBusy(true); setError(''); setMessage('');
    try {
      await gymCall(name, data);
      setMessage(t('gym.save'));
      await qc.invalidateQueries({ queryKey: ['gym'] });
      return true;
    } catch (e) { setError(`${t('gym.error')} ${e instanceof Error ? e.message : ''}`); return false; }
    finally { setBusy(false); }
  }

  function edit(session: GymSession) {
    setEditing(session); setLocationId(session.locationId); setRoomId(session.roomId);
    setDraft({ title: session.title, description: session.description, instructorId: session.instructorId,
      startDate: localDay(session.startsAt.toDate(), session.timezone),
      startTime: inputTime(session.startsAt.toDate(), session.timezone),
      endTime: inputTime(session.endsAt.toDate(), session.timezone),
      recurrence: 'none', weekdays: [], endDate: '', capacity: session.capacity,
      price: String(session.regularPriceCents / 100), cancellationHours: session.cancellationHours,
      status: session.status, reason: '', requestId: crypto.randomUUID() });
  }

  async function saveSession(event: React.FormEvent) {
    event.preventDefault();
    if (!location || !room) return;
    const regularPriceCents = Math.round(Number(draft.price) * 100);
    const data = { venueId, locationId: location.id, roomId: room.id, instructorId: draft.instructorId,
      title: draft.title, description: draft.description, startDate: draft.startDate,
      startTime: draft.startTime, endTime: draft.endTime, capacity: draft.capacity,
      regularPriceCents, cancellationHours: draft.cancellationHours, status: draft.status,
      ...(editing ? { sessionId: editing.id, reason: draft.reason, requestId: draft.requestId } : {
        recurrence: draft.recurrence, weekdays: draft.weekdays,
        ...(draft.recurrence === 'weekly' ? { endDate: draft.endDate } : {}),
        requestId: draft.requestId,
      }) };
    if (await run(editing ? 'updateGymSession' : 'saveGymSchedule', data)) {
      setEditing(null); setDraft(prev => ({ ...prev, requestId: crypto.randomUUID(), status: 'draft', reason: '' }));
    }
  }

  if (!venueId) return <div className="p-6"><Link href="/fit/gyms">{t('gym.selectGym')}</Link></div>;
  if (!uid) return <div className="p-6"><Link href="/auth/login">{t('gym.signIn')}</Link></div>;
  if (venue.isLoading || staff.isLoading) return <div className="p-6">{t('common.loading')}</div>;
  if (!canManage) return <div className="p-6">{t('gym.error')}</div>;
  return <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 pb-28 md:px-8">
    <header className="space-y-2"><Link className="text-section-primary" href={`/fit/gyms/timetable?id=${venueId}`}>← {t('gym.timetable')}</Link>
      <h1 className="text-3xl font-bold">{t('gym.manage')} · {venue.data?.name}</h1></header>
    {venue.data?.partnerStatus !== 'active' && <p className="rounded-xl border border-hairline p-4">{t('gym.partnershipRequired')}</p>}
    <section className="grid gap-5 lg:grid-cols-2">
      <form className="space-y-3 rounded-2xl border border-hairline bg-surface p-5" onSubmit={async event => {
        event.preventDefault(); if (await run('saveGymSpace', { kind: 'location', venueId,
          ...locationForm, isActive: true })) setLocationForm({ name: '', address: '', city: '', timezone: 'Europe/Rome' });
      }}>
        <h2 className="text-lg font-semibold">{t('gym.addLocation')}</h2>
        <label className="block text-sm">{t('gym.location')}<input className={field} required minLength={2} value={locationForm.name}
          onChange={e => setLocationForm({ ...locationForm, name: e.target.value })} /></label>
        <label className="block text-sm">{t('gym.address')}<input className={field} required minLength={2} value={locationForm.address}
          onChange={e => setLocationForm({ ...locationForm, address: e.target.value })} /></label>
        <label className="block text-sm">{t('gym.city')}<input className={field} required minLength={2} value={locationForm.city}
          onChange={e => setLocationForm({ ...locationForm, city: e.target.value })} /></label>
        <label className="block text-sm">{t('gym.timezone')}<input className={field} required value={locationForm.timezone}
          onChange={e => setLocationForm({ ...locationForm, timezone: e.target.value })} /></label>
        <Button type="submit" disabled={busy}>{t('gym.addLocation')}</Button>
      </form>
      <form className="space-y-3 rounded-2xl border border-hairline bg-surface p-5" onSubmit={async event => {
        event.preventDefault(); if (location && await run('saveGymSpace', { kind: 'room', venueId,
          locationId: location.id, name: roomName, isActive: true })) setRoomName('');
      }}>
        <h2 className="text-lg font-semibold">{t('gym.addRoom')}</h2>
        <label className="block text-sm">{t('gym.chooseLocation')}
          <select className={field} value={location?.id ?? ''} onChange={e => { setLocationId(e.target.value); setRoomId(''); }}>
            {locations.data?.filter(item => item.isActive).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
        <label className="block text-sm">{t('gym.room')}<input className={field} required minLength={2} value={roomName}
          onChange={e => setRoomName(e.target.value)} /></label>
        <Button type="submit" disabled={busy || !location}>{t('gym.addRoom')}</Button>
      </form>
    </section>
    <form className="space-y-4 rounded-2xl border border-hairline bg-surface p-5" onSubmit={saveSession}>
      <h2 className="text-xl font-semibold">{t(editing ? 'gym.editSession' : 'gym.createSession')}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-sm">{t('gym.chooseLocation')}<select className={field} value={location?.id ?? ''}
          onChange={e => { setLocationId(e.target.value); setRoomId(''); }}>
          {locations.data?.filter(item => item.isActive).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label className="block text-sm">{t('gym.chooseRoom')}<select className={field} value={room?.id ?? ''}
          onChange={e => setRoomId(e.target.value)}>
          {rooms.data?.filter(item => item.isActive).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label className="block text-sm">{t('gym.instructor')}<select className={field} value={draft.instructorId}
          onChange={e => setDraft({ ...draft, instructorId: e.target.value })}>
          <option value="">{t('common.select')}</option>
          {instructors.data?.filter(item => item.isActive).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label className="block text-sm">{t('gym.title')}<input className={field} required minLength={2} value={draft.title}
          onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
        <label className="block text-sm sm:col-span-2">{t('gym.description')}<input className={field} value={draft.description}
          onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
        <label className="block text-sm">{t('gym.startDate')}<input className={field} type="date" required value={draft.startDate}
          onChange={e => setDraft({ ...draft, startDate: e.target.value })} /></label>
        <label className="block text-sm">{t('gym.startTime')}<input className={field} type="time" required value={draft.startTime}
          onChange={e => setDraft({ ...draft, startTime: e.target.value })} /></label>
        <label className="block text-sm">{t('gym.endTime')}<input className={field} type="time" required value={draft.endTime}
          onChange={e => setDraft({ ...draft, endTime: e.target.value })} /></label>
        <label className="block text-sm">{t('gym.capacity')}<input className={field} type="number" min="1" max="100" required value={draft.capacity}
          onChange={e => setDraft({ ...draft, capacity: Number(e.target.value) })} /></label>
        <label className="block text-sm">{t('gym.price')}<input className={field} type="number" min="0" max="100000" step="0.01" required value={draft.price}
          onChange={e => setDraft({ ...draft, price: e.target.value })} /></label>
        <label className="block text-sm">{t('gym.cancellationHours')}<input className={field} type="number" min="0" max="720" required value={draft.cancellationHours}
          onChange={e => setDraft({ ...draft, cancellationHours: Number(e.target.value) })} /></label>
        <label className="block text-sm">{t('gym.status')}<select className={field} value={draft.status}
          onChange={e => setDraft({ ...draft, status: e.target.value as typeof draft.status })}>
          <option value="draft">{t('gym.draft')}</option><option value="published">{t('gym.published')}</option>
          {editing && <option value="cancelled">{t('gym.cancelled')}</option>}
        </select></label>
      </div>
      {!editing && <><label className="flex items-center gap-2"><input type="checkbox" checked={draft.recurrence === 'weekly'}
        onChange={e => setDraft({ ...draft, recurrence: e.target.checked ? 'weekly' : 'none' })} />{t('gym.createWeekly')}</label>
        {draft.recurrence === 'weekly' && <div className="space-y-3"><label className="block text-sm">{t('gym.endDate')}
          <input className={field} type="date" required min={draft.startDate} max={addDays(draft.startDate, 55)} value={draft.endDate}
            onChange={e => setDraft({ ...draft, endDate: e.target.value })} /></label>
          <fieldset className="flex flex-wrap gap-3"><legend className="text-sm">{t('gym.weekdays')}</legend>
            {[1, 2, 3, 4, 5, 6, 0].map(weekday => <label key={weekday} className="flex items-center gap-1">
              <input type="checkbox" checked={draft.weekdays.includes(weekday)} onChange={e => setDraft({ ...draft,
                weekdays: e.target.checked ? [...draft.weekdays, weekday] : draft.weekdays.filter(day => day !== weekday) })} />
              {new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 9, 4 + weekday)))}
            </label>)}</fieldset></div>}</>}
      {editing && draft.status === 'cancelled' && <label className="block text-sm">{t('gym.reason')}<input className={field} required value={draft.reason}
        onChange={e => setDraft({ ...draft, reason: e.target.value })} /></label>}
      <div className="flex gap-2"><Button type="submit" disabled={busy || !location || !room || !draft.instructorId}>{t('gym.save')}</Button>
        {editing && <Button type="button" variant="ghost" onClick={() => setEditing(null)}>{t('common.close')}</Button>}</div>
    </form>
    <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{t('gym.timetable')}</h2>
      <div className="flex gap-2"><Button variant="outline" onClick={() => setWeek(addDays(week, -7))}>←</Button>
        <Button variant="outline" onClick={() => setWeek(addDays(week, 7))}>→</Button></div></div>
      {sessions.isLoading && <p>{t('common.loading')}</p>}
      <div className="grid gap-3 md:grid-cols-2">{[...(sessions.data ?? [])].sort((a, b) => a.startsAt.toMillis() - b.startsAt.toMillis()).map(session =>
        <article key={session.id} className="rounded-xl border border-hairline bg-surface p-4">
          <h3 className="font-semibold">{session.title} · {session.roomName}</h3>
          <p className="text-sm">{localDay(session.startsAt.toDate(), session.timezone)} · {sessionTime(session.startsAt.toDate(), locale, session.timezone)}–{sessionTime(session.endsAt.toDate(), locale, session.timezone)}</p>
          <p className="text-sm text-content-muted">{session.instructorName} · {session.booked}/{session.capacity} · {t(`gym.${session.status}`)}</p>
          <Button variant="outline" onClick={() => edit(session)}>{t('gym.editSession')}</Button>
        </article>)}</div>
    </section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">{t('gym.myBookings')}</h2>
      {bookings.data?.filter(booking => booking.state === 'confirmed' || (booking.refundDueCents ?? 0) > 0).map(booking =>
        <article key={booking.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline bg-surface p-4">
          <div><p className="font-semibold">{booking.title}</p><p className="text-sm text-content-muted">{localDay(booking.startsAt.toDate(), booking.timezone)} · {booking.customerName || booking.userId}</p></div>
          {booking.state === 'confirmed' && booking.paymentStatus === 'pending' && <Button size="sm" disabled={busy}
            onClick={() => run('recordGymPayment', { bookingId: booking.id, method: 'cash' })}>{t('gym.recordPayment')}</Button>}
          {(booking.refundDueCents ?? 0) > 0 && <Button size="sm" disabled={busy} onClick={() => run('confirmGymRefund', { bookingId: booking.id })}>{t('gym.confirmRefund')}</Button>}
        </article>)}</section>
    {message && <p role="status" className="text-emerald-500">{message}</p>}
    {error && <p role="alert" className="text-red-500">{error}</p>}
  </div>;
}

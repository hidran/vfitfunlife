'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  useCourses, useManagedVenueCourses, useCourseSessions, useCourseEnrollments, useVenueEnrollments, useCourseParticipants,
  useCourseRefunds, useVenueRefunds, useCustomerCounters, useRefreshCourses,
} from '@/hooks/useCourses';
import { useManagedVenues } from '@/hooks/useManagedVenues';
import { courseCall } from '@/lib/firebase/courses';
import { fetchVenueRooms } from '@/lib/firebase/venueSpaces';
import { courseErrorMessage } from '@/lib/courseErrors';
import { isProviderAreaUser } from '@/lib/providerStatus';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/Modal';
import { VenueSpacesPanel } from '@/components/venues/VenueSpacesPanel';
import { AddCourseParticipant } from '@/components/courses/AddCourseParticipant';
import { ParticipantInvitation } from '@/components/courses/ParticipantInvitation';
import { LessonWaitlist } from '@/components/courses/LessonWaitlist';
import { SubstituteInstructor } from '@/components/courses/SubstituteInstructor';
import { LessonCapacity } from '@/components/courses/LessonCapacity';
import { courseDate, courseMoney } from '@/components/courses/CourseBooking';

const HOUR_MS = 3600000;

/**
 * Staff removal of one participant from one lesson (seat freed, refund and waitlist promotion follow on the server).
 * Past the customer's own cancellation deadline the removal is recorded as a late cancellation, which the warning says.
 */
function RemoveParticipant({ courseId, sessionId, userId, name, late, busy, onRun }: {
  courseId: string; sessionId: string; userId: string; name: string; late: boolean; busy: boolean;
  onRun: (name: string, data: Record<string, unknown>) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open) return <Button size="sm" variant="outline" className="min-h-11" disabled={busy} aria-label={`${t('courses.removeParticipant')} ${name}`}
    onClick={() => setOpen(true)}>{t('courses.removeParticipant')}</Button>;
  return <div className="w-full space-y-2 rounded-xl border border-hairline p-3">
    {late && <p className="text-sm text-amber-600 dark:text-amber-400" role="note">{t('courses.removeLateWarning')}</p>}
    <label className="block space-y-1 text-sm">{t('courses.reason')}
      <input className="w-full min-h-11 rounded-xl border border-hairline bg-surface p-3 text-content" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" className="min-h-11" disabled={busy} onClick={async () => {
        if (await onRun('manageCourseSession', { courseId, sessionId, action: 'removeParticipant', userId, ...(reason.trim() ? { reason: reason.trim() } : {}) })) setOpen(false);
      }}>{t('courses.confirmRemove')}</Button>
      <Button size="sm" variant="ghost" className="min-h-11" disabled={busy} onClick={() => setOpen(false)}>{t('common.cancel')}</Button></div>
  </div>;
}

/** No-shows from this count on are called out next to the customer's name. */
const REPEAT_NO_SHOWS = 2;

export function ProviderCourses() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const venueId = params.get('venue') || undefined;
  const uid = useAuthStore(s => s.firebaseUser?.uid);
  const user = useAuthStore(s => s.user);
  const { venues, isLoading: venuesLoading } = useManagedVenues();
  const providerUser = isProviderAreaUser(user);
  // Venue scope reads by venueId (owner and staff are allowed by the rules); otherwise the provider's own courses.
  const own = useCourses(venueId ? undefined : uid, !venueId && !!uid);
  const atVenue = useManagedVenueCourses(venueId);
  const ownEnrollments = useCourseEnrollments(venueId ? undefined : uid, true);
  const venueEnrollments = useVenueEnrollments(venueId);
  const ownRefunds = useCourseRefunds(venueId ? undefined : uid);
  const venueRefunds = useVenueRefunds(venueId);
  const refresh = useRefreshCourses();
  const [courseId, setCourseId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [payment, setPayment] = useState<{ enrollmentId: string; method: string } | null>(null);
  const [operation, setOperation] = useState<'cancel' | 'reschedule' | 'cancelRemaining' | null>(null);
  const [reason, setReason] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newRoom, setNewRoom] = useState('');
  const query = venueId ? atVenue : own;
  const courses = venueId ? [...(atVenue.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, locale)) :
    own.data?.pages.flatMap(p => p.courses) ?? [];
  const enrollments = venueId ? venueEnrollments : ownEnrollments;
  const refunds = venueId ? venueRefunds : ownRefunds;
  const course = courses.find(c => c.id === courseId);
  const sessions = useCourseSessions(courseId || undefined);
  const participants = useCourseParticipants(courseId || undefined, sessionId || undefined);
  const counters = useCustomerCounters(courseId || undefined);
  const selectedSession = sessions.data?.find(s => s.id === sessionId);
  const venue = venues.find(v => v.id === venueId);
  const rooms = useQuery({ queryKey: ['venueSpaces', course?.venueId, 'rooms', course?.locationId],
    enabled: operation === 'reschedule' && !!course?.venueId && !!course.locationId,
    queryFn: () => fetchVenueRooms(course!.venueId!, course!.locationId!) });
  const upcoming = selectedSession?.state === 'scheduled' && selectedSession.startsAt.toMillis() > Date.now();
  const field = 'rounded-xl border border-hairline bg-surface text-content p-3 w-full min-h-11';
  const createHref = `/provider/courses/create${venueId ? `?venue=${venueId}` : ''}`;
  const repeat = new Map((counters.data ?? []).map(c => [c.userId, c]));
  const lateCancelled = (enrollments.data ?? []).filter(e => e.courseId === courseId && sessionId &&
    e.lateCancelledSessionIds?.includes(sessionId));

  // Someone who only manages a venue has no courses of their own: land on the venue.
  useEffect(() => {
    if (!venueId && user && !providerUser && !venuesLoading && venues.length > 0) router.replace(`/provider/courses?venue=${venues[0].id}`);
  }, [venueId, user, providerUser, venuesLoading, venues, router]);

  async function run(name: string, data: Record<string, unknown>) {
    setBusy(true); setError(''); setStatus('');
    try { await courseCall(name, data); await refresh(); setStatus(t('common.save')); return true; }
    catch (err) { setError(courseErrorMessage(err, t, locale)); return false; }
    finally { setBusy(false); }
  }
  async function sessionAction() {
    let startsAt: string | undefined;
    if (operation === 'reschedule' && course) {
      try {
        const result = await courseCall<{ sessions: { startsAt: string }[] }>('previewCourse', { course: {
          ...course, recurrence: 'none', startDate: newDate.slice(0, 10), startTime: newDate.slice(11, 16) } });
        startsAt = result.sessions[0].startsAt;
      } catch (err) { setError(courseErrorMessage(err, t, locale)); return; }
    }
    const roomId = operation === 'reschedule' && course?.venueId ? newRoom || selectedSession?.roomId || course.roomId : null;
    if (await run(operation === 'cancelRemaining' ? 'cancelRemainingCourse' : 'manageCourseSession', { courseId, sessionId, action: operation, reason,
      ...(startsAt ? { startsAt } : {}), ...(roomId ? { roomId } : {}) })) {
      setOperation(null); setReason(''); setNewRoom('');
    }
  }
  const switchable = venues.length > 1 || (providerUser && venues.length > 0);
  return <div className="space-y-6 text-content">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 space-y-2">
        <h1 className="text-2xl font-bold break-words">{venueId ? t('courses.venueScope', { name: venue?.name ?? venueId }) : t('courses.manage')}</h1>
        {switchable && <label className="block text-sm">{t('courses.venue')}
          <select className={`${field} mt-1`} value={venueId ?? ''} onChange={e => router.push(`/provider/courses${e.target.value ? `?venue=${e.target.value}` : ''}`)}>
            {providerUser && <option value="">{t('courses.manage')}</option>}
            {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>}
      </div>
      <Link href={createHref} className="inline-flex min-h-11 items-center rounded-xl bg-section-primary px-4 py-3 text-white font-semibold">{t('courses.create')}</Link></header>
    {error && <p role="alert" className="text-red-500">{error}</p>}{status && <p role="status">{status}</p>}
    {query.isError && <p role="alert">{t('courses.loadError')}</p>}{query.isLoading && <p>{t('common.loading')}</p>}
    {!query.isLoading && !courses.length && <p>{t('courses.emptyProvider')}</p>}
    <div className="grid md:grid-cols-2 gap-4">{courses.map(c => <article key={c.id} className="rounded-2xl bg-surface border border-hairline p-5 space-y-3">
      <div className="flex justify-between flex-wrap gap-2"><h2 className="text-lg font-semibold">{c.name}</h2><span className="text-sm">{t(`courses.${c.state}`)}</span></div>
      <p className="text-sm text-content-muted">{c.location} · {t('courses.sessions')}: {c.sessionIds.length} · {t('courses.capacity')}: {c.capacity}</p>
      <div className="flex flex-wrap gap-2"><Link href={`/provider/courses/edit?id=${c.id}${venueId ? `&venue=${venueId}` : ''}`} className="inline-flex min-h-11 items-center rounded-xl border border-hairline px-3 py-2 text-sm">{t('courses.edit')}</Link>
        <Button size="sm" className="min-h-11" onClick={() => { setCourseId(c.id); setSessionId(''); setOperation(null); }}>{t('courses.roster')}</Button></div>
    </article>)}</div>
    {!venueId && own.hasNextPage && <Button onClick={() => own.fetchNextPage()}>{t('courses.more')}</Button>}
    {course && <section className="rounded-2xl border border-hairline bg-surface p-5 space-y-4">
      <h2 className="font-semibold text-xl">{course.name} · {t('courses.sessions')}</h2>
      <Button variant="outline" size="sm" className="min-h-11" disabled={busy} onClick={() => setOperation('cancelRemaining')}>{t('courses.cancelRemaining')}</Button>
      <label className="block space-y-1">{t('courses.lesson')}<select className={field} value={sessionId} onChange={e => { setSessionId(e.target.value); setOperation(null); }}>
        <option value="">{t('common.select')}</option>{sessions.data?.map(s => <option key={s.id} value={s.id}>{courseDate(s, locale, course.timezone)} · {s.occupied + s.held}/{s.capacity} {s.state === 'cancelled' ? t('courses.cancelled') : ''}</option>)}</select></label>
      {operation === 'cancelRemaining' && <div className="space-y-3"><label className="block">{t('courses.reason')}<input required className={field} value={reason} onChange={e => setReason(e.target.value)} /></label>
        <Button disabled={busy || !reason.trim()} onClick={() => sessionAction()}>{t('courses.confirm')}</Button></div>}
      {selectedSession && <>
        {selectedSession.state === 'scheduled' && selectedSession.startsAt.toMillis() > Date.now() &&
          <AddCourseParticipant key={selectedSession.id} course={course} session={selectedSession} onAdded={() => { void refresh(); }} />}
        <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" className="min-h-11" disabled={busy || selectedSession.state !== 'scheduled' || selectedSession.startsAt.toMillis() <= Date.now()}
          onClick={() => setOperation('cancel')}>{t('courses.cancelLesson')}</Button>
          <Button variant="outline" size="sm" className="min-h-11" disabled={busy || selectedSession.state !== 'scheduled' || selectedSession.startsAt.toMillis() <= Date.now()}
            onClick={() => setOperation('reschedule')}>{t('courses.reschedule')}</Button>
          {upcoming && <SubstituteInstructor key={`sub-${selectedSession.id}`} course={course} session={selectedSession} />}
          {upcoming && <LessonCapacity key={`cap-${selectedSession.id}`} courseId={courseId} session={selectedSession} />}</div>
        {operation && operation !== 'cancelRemaining' && <div className="space-y-3"><label className="block">{t('courses.reason')}<input required className={field} value={reason} onChange={e => setReason(e.target.value)} /></label>
          {operation === 'reschedule' && <label className="block">{t('courses.startDate')} · {course.timezone}<input type="datetime-local" className={field} value={newDate} onChange={e => setNewDate(e.target.value)} /></label>}
          {operation === 'reschedule' && course.venueId && <label className="block">{t('courses.rescheduleRoom')}
            <select className={field} value={newRoom || selectedSession.roomId || course.roomId || ''} onChange={e => setNewRoom(e.target.value)}>
              {(rooms.data ?? []).filter(r => r.isActive || r.id === (selectedSession.roomId ?? course.roomId)).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}
          <Button disabled={busy || !reason.trim() || (operation === 'reschedule' && !newDate)} onClick={() => sessionAction()}>{t('courses.confirm')}</Button></div>}
        {participants.isError && <p role="alert">{t('courses.loadError')}</p>}
        <h3 className="font-semibold">{t('courses.roster')}</h3>
        <ul className="divide-y divide-hairline">{participants.data?.map(p => {
          const enrollment = enrollments.data?.find(e => e.id === p.enrollmentId);
          const noShows = repeat.get(p.userId)?.noShows ?? 0;
          return <li key={p.id} className="py-4 space-y-2"><div className="flex justify-between flex-wrap gap-2"><span className="font-medium">{p.customerName}
            {p.noShow && <span className="ml-2 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-500">{t('courses.noShow')}</span>}
            {noShows >= REPEAT_NO_SHOWS && <span className="ml-2 text-xs text-content-muted">{t('courses.noShows', { count: noShows })}</span>}</span>
            <span>{enrollment && courseMoney(enrollment.totalCents, locale)} · {t(enrollment?.paymentStatus === 'paid' ? 'courses.paid' : 'courses.pending')}</span></div>
            <div className="flex flex-wrap gap-3 items-center"><label className="text-sm">{t('courses.attendance')}<select className={field} value={p.attendance}
              disabled={busy || p.state !== 'confirmed' || selectedSession.startsAt.toMillis() > Date.now()}
              onChange={e => run('manageCourseSession', { courseId, sessionId, action: 'attendance', userId: p.userId, attendance: e.target.value })}>
              {(['unmarked', 'present', 'absent'] as const).map(v => <option key={v} value={v}>{t(`courses.${v}`)}</option>)}</select></label>
              {enrollment?.paymentMode === 'direct' && enrollment.paymentStatus !== 'paid' && <Button size="sm" className="min-h-11" disabled={busy} onClick={() => setPayment({ enrollmentId: p.enrollmentId, method: 'cash' })}>{t('courses.recordPayment')}</Button>}
              {upcoming && <RemoveParticipant key={`${sessionId}-${p.userId}`} courseId={courseId} sessionId={sessionId} userId={p.userId} name={p.customerName} busy={busy} onRun={run}
                late={!!enrollment && selectedSession.startsAt.toMillis() <= Date.now() + enrollment.cancellationHours * HOUR_MS} />}
            </div><ParticipantInvitation courseId={courseId} userId={p.userId} /></li>;
        })}</ul>
        <LessonWaitlist key={`wl-${sessionId}`} courseId={courseId} sessionId={sessionId} />
        {lateCancelled.length > 0 && <div className="space-y-1"><h3 className="font-semibold">{t('courses.lateCancels')}</h3>
          <ul className="text-sm text-content-muted">{lateCancelled.map(e => {
            const count = repeat.get(e.userId)?.lateCancels ?? 0;
            return <li key={e.id}>{e.customerName}{count >= REPEAT_NO_SHOWS && ` · ${count}`}</li>;
          })}</ul></div>}
      </>}
    </section>}
    {refunds.data?.some(r => r.status !== 'completed') && <section className="space-y-3"><h2 className="font-semibold text-xl">{t('courses.refunds')}</h2>
      {refunds.data.filter(r => r.status !== 'completed').map(r => <div key={r.id} className="rounded-xl border border-hairline p-4 flex flex-wrap gap-3 justify-between">
        <span>{t('courses.refundDue')} · {courseMoney(r.amountCents, locale)} · {enrollments.data?.find(e => e.id === r.enrollmentId)?.customerName}</span>
        {r.paymentMode === 'direct' && <Button size="sm" className="min-h-11" disabled={busy} onClick={() => run('confirmCourseRefund', { refundId: r.id })}>{t('courses.confirmRefund')}</Button>}</div>)}
    </section>}
    {venueId && <VenueSpacesPanel venueId={venueId} />}
    {payment && <Modal onClose={() => setPayment(null)} className="w-full max-w-md" ariaLabel={t('courses.recordPayment')}>
      {payment && <div className="p-5 space-y-4"><h2 className="font-semibold">{t('courses.recordPayment')}</h2>
        <label className="block">{t('courses.direct')}<select className={field} value={payment.method} onChange={e => setPayment({ ...payment, method: e.target.value })}>
          {(['cash', 'bank_transfer', 'satispay', 'other'] as const).map(v => <option key={v} value={v}>{t(`courses.${v}`)}</option>)}</select></label>
        <Button disabled={busy} onClick={async () => { if (await run('recordCoursePayment', payment)) setPayment(null); }}>{t('courses.confirm')}</Button>
        <Button variant="ghost" onClick={() => setPayment(null)}>{t('common.close')}</Button></div>}
    </Modal>}
  </div>;
}

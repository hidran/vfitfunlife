'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { courseCall, fetchCourse } from '@/lib/firebase/courses';
import { fetchVenueRooms } from '@/lib/firebase/venueSpaces';
import {
  useCourseParticipants, useCourseRoster, useCourseSessions, useCustomerCounters, useRefreshCourses,
} from '@/hooks/useCourses';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/hooks/useI18n';
import { courseErrorMessage } from '@/lib/courseErrors';
import { Button } from '@/components/ui/button';
import { AddCourseParticipant } from './AddCourseParticipant';
import { ParticipantInvitation } from './ParticipantInvitation';
import { LessonWaitlist } from './LessonWaitlist';
import { SubstituteInstructor } from './SubstituteInstructor';
import { LessonCapacity } from './LessonCapacity';
import { courseDate, courseMoney } from '@/lib/courseFormat';

const HOUR_MS = 3600000;
/** No-shows from this count on are called out next to the customer's name. */
const REPEAT_NO_SHOWS = 2;

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
    {late && <p className="text-sm text-warning" role="note">{t('courses.removeLateWarning')}</p>}
    <label className="block space-y-1 text-sm">{t('courses.reason')}
      <input className="w-full min-h-11 rounded-xl border border-hairline bg-surface p-3 text-content" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" className="min-h-11" disabled={busy} onClick={async () => {
        if (await onRun('manageCourseSession', { courseId, sessionId, action: 'removeParticipant', userId, ...(reason.trim() ? { reason: reason.trim() } : {}) })) setOpen(false);
      }}>{t('courses.confirmRemove')}</Button>
      <Button size="sm" variant="ghost" className="min-h-11" disabled={busy} onClick={() => setOpen(false)}>{t('common.cancel')}</Button></div>
  </div>;
}

/**
 * The participants of one course, addressed as
 * `/provider/courses/detail?id=<courseId>&venue=<venueId>&lesson=<sessionId>`: the lesson selector, roster, waitlist
 * and the actions on a lesson. A page (rather than the panel the course list used to open) so a roster can be
 * linked, reloaded and opened from a notification, and so recording a payment does not need a dialog.
 *
 * `?venue=` scopes the roster to a venue the user manages; without it the course is read as its provider's.
 */
export function CourseRoster() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const courseId = params.get('id') ?? '';
  const venueId = params.get('venue') ?? '';
  const uid = useAuthStore(s => s.firebaseUser?.uid);
  const refresh = useRefreshCourses();
  const courseQuery = useQuery({ queryKey: ['courses', 'detail', courseId], queryFn: () => fetchCourse(courseId), enabled: !!courseId });
  const course = courseQuery.data ?? null;
  const [sessionId, setSessionId] = useState(params.get('lesson') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [payment, setPayment] = useState<{ enrollmentId: string; method: string } | null>(null);
  const [operation, setOperation] = useState<'cancel' | 'reschedule' | 'cancelRemaining' | null>(null);
  const [reason, setReason] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newRoom, setNewRoom] = useState('');
  const roster = useCourseRoster(courseId || undefined, venueId ? { venueId } : uid ? { providerId: uid } : undefined);
  const sessions = useCourseSessions(courseId || undefined);
  const participants = useCourseParticipants(courseId || undefined, sessionId || undefined);
  const counters = useCustomerCounters(courseId || undefined);
  const selectedSession = sessions.data?.find(s => s.id === sessionId);
  const rooms = useQuery({ queryKey: ['venueSpaces', course?.venueId, 'rooms', course?.locationId],
    enabled: operation === 'reschedule' && !!course?.venueId && !!course.locationId,
    queryFn: () => fetchVenueRooms(course!.venueId!, course!.locationId!) });
  const upcoming = selectedSession?.state === 'scheduled' && selectedSession.startsAt.toMillis() > Date.now();
  const field = 'rounded-xl border border-hairline bg-surface text-content p-3 w-full min-h-11';
  const coursesHref = venueId ? `/provider/courses?venue=${encodeURIComponent(venueId)}` : '/provider/courses';
  const repeat = new Map((counters.data ?? []).map(c => [c.userId, c]));
  const lateCancelled = (roster.data ?? []).filter(e => e.courseId === courseId && sessionId &&
    e.lateCancelledSessionIds?.includes(sessionId));

  async function run(name: string, data: Record<string, unknown>) {
    setBusy(true); setError(''); setStatus('');
    try { await courseCall(name, data); await refresh(); setStatus(t('common.save')); return true; }
    catch (err) { setError(courseErrorMessage(err, t, locale)); return false; }
    finally { setBusy(false); }
  }
  /** The chosen lesson is part of the address, so reloading or sharing the page keeps it open. */
  function pickLesson(id: string) {
    setSessionId(id); setOperation(null);
    const next = new URLSearchParams({ id: courseId });
    if (venueId) next.set('venue', venueId);
    if (id) next.set('lesson', id);
    router.replace(`/provider/courses/detail?${next.toString()}`);
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
  if (!courseId) return <p role="alert">{t('courses.loadError')}</p>;
  if (courseQuery.isLoading) return <p>{t('common.loading')}</p>;
  if (courseQuery.isError || !course) return <div className="space-y-3 text-content">
    <p role="alert">{t('courses.loadError')}</p>
    <Link href={coursesHref} className="inline-flex min-h-11 items-center underline">{t('courses.back')}</Link></div>;
  return <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-8 pb-24 text-content">
    <Link href={coursesHref} className="inline-flex min-h-11 items-center underline">{t('courses.back')}</Link>
    <header className="space-y-2">
      <h1 className="text-2xl font-bold break-words">{course.name}</h1>
      <p className="text-sm text-content-muted">{course.location} · {t('courses.sessions')}: {course.sessionIds.length} · {t('courses.capacity')}: {course.capacity}</p>
      <Link href={`/provider/courses/edit?id=${encodeURIComponent(course.id)}${venueId ? `&venue=${encodeURIComponent(venueId)}` : ''}`}
        className="inline-flex min-h-11 items-center rounded-xl border border-hairline px-3 py-2 text-sm">{t('courses.edit')}</Link>
    </header>
    {error && <p role="alert" className="text-error">{error}</p>}{status && <p role="status">{status}</p>}
    {sessions.isError && <p role="alert">{t('courses.loadError')}</p>}
    <section className="rounded-2xl border border-hairline bg-surface p-5 space-y-4">
      <h2 className="font-semibold text-xl">{t('courses.sessions')}</h2>
      <Button variant="outline" size="sm" className="min-h-11" disabled={busy} onClick={() => setOperation('cancelRemaining')}>{t('courses.cancelRemaining')}</Button>
      <label className="block space-y-1">{t('courses.lesson')}<select className={field} value={sessionId} onChange={e => pickLesson(e.target.value)}>
        <option value="">{t('common.select')}</option>{sessions.data?.map(s => <option key={s.id} value={s.id}>{courseDate(s, locale, course.timezone)} · {s.occupied + s.held}/{s.capacity} {s.state === 'cancelled' ? t('courses.cancelled') : ''}</option>)}</select></label>
      {operation === 'cancelRemaining' && <div className="space-y-3"><label className="block">{t('courses.reason')}<input required className={field} value={reason} onChange={e => setReason(e.target.value)} /></label>
        <Button disabled={busy || !reason.trim()} onClick={() => sessionAction()}>{t('courses.confirmCancelLesson')}</Button></div>}
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
          <Button disabled={busy || !reason.trim() || (operation === 'reschedule' && !newDate)} onClick={() => sessionAction()}>{t(operation === 'reschedule' ? 'courses.confirmReschedule' : 'courses.confirmCancelLesson')}</Button></div>}
        {participants.isError && <p role="alert">{t('courses.loadError')}</p>}
        <h3 className="font-semibold">{t('courses.roster')}</h3>
        <ul className="divide-y divide-hairline">{participants.data?.map(p => {
          const enrollment = roster.data?.find(e => e.id === p.enrollmentId);
          const noShows = repeat.get(p.userId)?.noShows ?? 0;
          return <li key={p.id} className="py-4 space-y-2"><div className="flex justify-between flex-wrap gap-2"><span className="font-medium">{p.customerName}
            {p.noShow && <span className="ml-2 rounded-full bg-error/15 px-2 py-0.5 text-xs font-semibold text-error">{t('courses.noShow')}</span>}
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
    </section>
    {payment && <section className="rounded-2xl border border-hairline bg-surface p-5 space-y-3">
      <h2 className="font-semibold">{t('courses.recordPayment')}</h2>
      <label className="block text-sm">{t('courses.paymentMethod')}<select className={field} value={payment.method} onChange={e => setPayment({ ...payment, method: e.target.value })}>
        {(['cash', 'bank_transfer', 'satispay', 'other'] as const).map(v => <option key={v} value={v}>{t(`courses.${v}`)}</option>)}</select></label>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={async () => { if (await run('recordCoursePayment', payment)) setPayment(null); }}>{t('common.confirm')}</Button>
        <Button variant="ghost" disabled={busy} onClick={() => setPayment(null)}>{t('common.cancel')}</Button>
      </div>
    </section>}
  </div>;
}

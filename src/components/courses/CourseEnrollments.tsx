'use client';
import { useState } from 'react';
import { useCourseEnrollments, useCourseSessions, useCoursesById, useRefreshCourses } from '@/hooks/useCourses';
import { useLessonWindow } from '@/hooks/useLessonWindow';
import { useNow } from '@/hooks/useNow';
import { courseErrorMessage } from '@/lib/courseErrors';
import { courseHref, coursePrice } from '@/lib/courseFormat';
import { MyWaitlist } from './MyWaitlist';
import { courseCall } from '@/lib/firebase/courses';
import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/button';
import { courseMoney, courseDate } from '@/lib/courseFormat';
import { LessonMonthNav } from './LessonMonthNav';
import type { CourseEnrollment } from '@/types/course';
import Link from 'next/link';
export function CourseEnrollments({ uid }: { uid?: string }) {
  const { t } = useI18n();
  const query = useCourseEnrollments(uid);
  if (query.isLoading) return <p>{t('common.loading')}</p>;
  if (query.isError) return <p role="alert">{t('courses.loadError')}</p>;
  return <div className="space-y-4">
    {query.data?.map(e => <EnrollmentCard key={e.id} enrollment={e} />)}
    <MyWaitlist uid={uid} showEmpty={!query.data?.length} /></div>;
}
function EnrollmentCard({ enrollment: e }: { enrollment: CourseEnrollment }) {
  const { t, locale } = useI18n();
  const now = useNow();
  const sessions = useCourseSessions(e.courseId);
  // Bookings made before the time zone was stored on them take the course's.
  const course = useCoursesById(e.timezone ? [] : [e.courseId]);
  const timezone = e.timezone || course.map.get(e.courseId)?.timezone;
  // A series can hold a lesson per week for a year: filter by month and page through them instead of one long card.
  const lessons = (sessions.data ?? []).filter(s => e.sessionIds.includes(s.id));
  const list = useLessonWindow(lessons, timezone, now);
  const refresh = useRefreshCourses();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cancelId, setCancelId] = useState<string | null>(null);
  async function cancel(sessionId: string) {
    setBusy(true); setError('');
    try { await courseCall('cancelCourseEnrollment', { enrollmentId: e.id, sessionIds: [sessionId] }); setCancelId(null); await refresh(); }
    catch (err) { setError(courseErrorMessage(err, t, locale)); } finally { setBusy(false); }
  }
  async function checkout() {
    setBusy(true); setError('');
    try { const result = await courseCall<{ url: string }>('createCourseCheckout', { enrollmentId: e.id }); window.location.assign(result.url); }
    catch (err) { setError(courseErrorMessage(err, t, locale)); } finally { setBusy(false); }
  }
  const holdOpen = e.state === 'held' && e.holdExpiresAt.toMillis() > now;
  const minutesLeft = Math.max(1, Math.ceil((e.holdExpiresAt.toMillis() - now) / 60000));
  return <article className="rounded-2xl border border-hairline bg-surface p-5 space-y-3">
    <div className="flex flex-wrap justify-between gap-2"><Link className="inline-flex min-h-11 items-center font-semibold text-lg underline-offset-4 hover:underline" href={courseHref(e.courseId)}>{e.courseName}</Link>
      <span className="text-sm">{t(`courses.${e.state}`)}</span></div>
    <p>{t(`courses.${e.scope}`)} · {coursePrice(e.totalCents, locale, t('courses.free'))} · {t(e.paymentStatus === 'paid' ? 'courses.paid' : 'courses.pending')}</p>
    <p className="text-sm text-content-muted">{t(e.paymentMode === 'direct' ? 'courses.direct' : 'courses.online')}</p>
    {e.refundCents > 0 && <p>{t('courses.refunds')}: {courseMoney(e.refundCents, locale)}</p>}
    {holdOpen && e.promotedFromWaitlist && <p className="text-sm font-medium text-warning" data-testid="pay-within">
      {minutesLeft === 1 ? t('courses.payWithinOne') : t('courses.payWithin', { minutes: minutesLeft })}</p>}
    {holdOpen && <Button className="min-h-11" onClick={checkout} disabled={busy}>{t('courses.pay')}</Button>}
    <LessonMonthNav months={list.months} month={list.month} onMonth={list.setMonth}
      page={list.page} onPage={list.setPage} canFilterByMonth={list.canFilterByMonth} />
    {list.page.items.map(s => {
      const active = e.activeSessionIds.includes(s.id);
      const cancellable = active && (e.state === 'held' || s.startsAt.toMillis() > now + e.cancellationHours * 3600000);
      return <div key={s.id} className="border-t border-hairline pt-3 flex flex-wrap justify-between items-center gap-2">
        <span>{timezone && courseDate(s, locale, timezone)} {!active && `· ${t('courses.cancelled')}`}</span>
        {cancellable && <Button size="sm" variant="outline" className="min-h-11" disabled={busy} onClick={() => setCancelId(s.id)}>{t('courses.cancelBooking')}</Button>}
        {active && !cancellable && s.startsAt.toMillis() > now && <p className="w-full text-sm text-content-muted" data-testid="cancel-closed">{t('courses.cancelClosed', { hours: e.cancellationHours })}</p>}
        {cancelId === s.id && <div className="w-full flex flex-wrap gap-2"><p className="w-full">{t('courses.cancelBookingConfirm')}</p>
          <Button size="sm" className="min-h-11" disabled={busy} onClick={() => cancel(s.id)}>{t('courses.confirmCancelBooking')}</Button>
          <Button size="sm" variant="ghost" className="min-h-11" onClick={() => setCancelId(null)}>{t('common.cancel')}</Button></div>}
      </div>;
    })}
    {error && <p role="alert" className="text-error">{error}</p>}
  </article>;
}

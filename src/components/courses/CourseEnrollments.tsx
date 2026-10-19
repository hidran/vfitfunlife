'use client';
import { useState } from 'react';
import { useCourseEnrollments, useCourseSessions, useRefreshCourses } from '@/hooks/useCourses';
import { courseCall } from '@/lib/firebase/courses';
import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/button';
import { courseMoney, courseDate } from './CourseBooking';
import type { CourseEnrollment } from '@/types/course';
import Link from 'next/link';
export function CourseEnrollments({ uid }: { uid?: string }) {
  const { t } = useI18n();
  const query = useCourseEnrollments(uid);
  if (query.isLoading) return <p>{t('common.loading')}</p>;
  if (query.isError) return <p role="alert">{t('courses.loadError')}</p>;
  return <div className="space-y-4">{!query.data?.length && <p className="text-content-muted">{t('courses.emptyBookings')}</p>}
    {query.data?.map(e => <EnrollmentCard key={e.id} enrollment={e} />)}</div>;
}
function EnrollmentCard({ enrollment: e }: { enrollment: CourseEnrollment }) {
  const { t, locale } = useI18n();
  const sessions = useCourseSessions(e.courseId);
  const refresh = useRefreshCourses();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cancelId, setCancelId] = useState<string | null>(null);
  async function cancel(sessionId: string) {
    setBusy(true); setError('');
    try { await courseCall('cancelCourseEnrollment', { enrollmentId: e.id, sessionIds: [sessionId] }); setCancelId(null); await refresh(); }
    catch { setError(t('courses.error')); } finally { setBusy(false); }
  }
  async function checkout() {
    setBusy(true); setError('');
    try { const result = await courseCall<{ url: string }>('createCourseCheckout', { enrollmentId: e.id }); window.location.assign(result.url); }
    catch { setError(t('courses.error')); } finally { setBusy(false); }
  }
  return <article className="rounded-2xl border border-hairline bg-surface p-5 space-y-3">
    <div className="flex flex-wrap justify-between gap-2"><Link className="font-semibold text-lg underline-offset-4 hover:underline" href={`/courses?id=${e.courseId}`}>{e.courseName}</Link>
      <span className="text-sm">{t(`courses.${e.state}`)}</span></div>
    <p>{t(`courses.${e.scope}`)} · {courseMoney(e.totalCents, locale)} · {t(e.paymentStatus === 'paid' ? 'courses.paid' : 'courses.pending')}</p>
    <p className="text-sm text-content-muted">{t(e.paymentMode === 'direct' ? 'courses.direct' : 'courses.online')}</p>
    {e.refundCents > 0 && <p>{t('courses.refunds')}: {courseMoney(e.refundCents, locale)}</p>}
    {e.state === 'held' && e.holdExpiresAt.toMillis() > Date.now() && <Button onClick={checkout} disabled={busy}>{t('courses.pay')}</Button>}
    {sessions.data?.filter(s => e.sessionIds.includes(s.id)).map(s => {
      const active = e.activeSessionIds.includes(s.id);
      const cancellable = active && (e.state === 'held' || s.startsAt.toMillis() > Date.now() + e.cancellationHours * 3600000);
      return <div key={s.id} className="border-t border-hairline pt-3 flex flex-wrap justify-between items-center gap-2">
        <span>{courseDate(s, locale, e.timezone ?? 'Europe/Rome')} {!active && `· ${t('courses.cancelled')}`}</span>
        {cancellable && <Button size="sm" variant="outline" disabled={busy} onClick={() => setCancelId(s.id)}>{t('courses.cancelBooking')}</Button>}
        {cancelId === s.id && <div className="w-full flex flex-wrap gap-2"><p className="w-full">{t('courses.cancelBooking')}?</p>
          <Button size="sm" disabled={busy} onClick={() => cancel(s.id)}>{t('courses.confirm')}</Button>
          <Button size="sm" variant="ghost" onClick={() => setCancelId(null)}>{t('common.close')}</Button></div>}
      </div>;
    })}
    {error && <p role="alert" className="text-red-500">{error}</p>}
  </article>;
}

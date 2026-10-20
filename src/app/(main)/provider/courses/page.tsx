'use client';
import { useState } from 'react';
import { useCourses, useCourseSessions, useCourseEnrollments, useCourseParticipants, useCourseRefunds, useRefreshCourses } from '@/hooks/useCourses';
import { courseCall } from '@/lib/firebase/courses';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/Modal';
import Link from 'next/link';
import { AddCourseParticipant } from '@/components/courses/AddCourseParticipant';
import { ParticipantInvitation } from '@/components/courses/ParticipantInvitation';
import { courseDate, courseMoney } from '@/components/courses/CourseBooking';
export default function ProviderCoursesPage() {
  const { t, locale } = useI18n();
  const uid = useAuthStore(s => s.firebaseUser?.uid);
  const query = useCourses(uid);
  const enrollments = useCourseEnrollments(uid, true);
  const refunds = useCourseRefunds(uid);
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
  const courses = query.data?.pages.flatMap(p => p.courses) ?? [];
  const course = courses.find(c => c.id === courseId);
  const sessions = useCourseSessions(courseId || undefined);
  const participants = useCourseParticipants(courseId || undefined, sessionId || undefined);
  const selectedSession = sessions.data?.find(s => s.id === sessionId);
  const field = 'rounded-xl border border-hairline bg-surface text-content p-3 w-full';
  async function run(name: string, data: Record<string, unknown>) {
    setBusy(true); setError(''); setStatus('');
    try { await courseCall(name, data); await refresh(); setStatus(t('common.save')); return true; }
    catch (err) { setError(`${t('courses.error')} ${err instanceof Error ? err.message : ''}`); return false; }
    finally { setBusy(false); }
  }
  async function sessionAction() {
    let startsAt: string | undefined;
    if (operation === 'reschedule' && course) {
      const result = await courseCall<{ sessions: { startsAt: string }[] }>('previewCourse', { course: {
        ...course, recurrence: 'none', startDate: newDate.slice(0, 10), startTime: newDate.slice(11, 16) } });
      startsAt = result.sessions[0].startsAt;
    }
    if (await run(operation === 'cancelRemaining' ? 'cancelRemainingCourse' : 'manageCourseSession', { courseId, sessionId, action: operation, reason, ...(startsAt ? { startsAt } : {}) })) {
      setOperation(null); setReason('');
    }
  }
  return <div className="space-y-6 text-content">
    <header className="flex flex-wrap justify-between gap-3"><h1 className="text-2xl font-bold">{t('courses.manage')}</h1>
      <Link href="/provider/courses/create" className="rounded-xl bg-section-primary px-4 py-3 text-white font-semibold">{t('courses.create')}</Link></header>
    {error && <p role="alert" className="text-red-500">{error}</p>}{status && <p role="status">{status}</p>}
    {query.isError && <p role="alert">{t('courses.loadError')}</p>}{query.isLoading && <p>{t('common.loading')}</p>}
    {!query.isLoading && !courses.length && <p>{t('courses.emptyProvider')}</p>}
    <div className="grid md:grid-cols-2 gap-4">{courses.map(c => <article key={c.id} className="rounded-2xl bg-surface border border-hairline p-5 space-y-3">
      <div className="flex justify-between flex-wrap gap-2"><h2 className="text-lg font-semibold">{c.name}</h2><span className="text-sm">{t(`courses.${c.state}`)}</span></div>
      <p className="text-sm text-content-muted">{c.location} · {t('courses.sessions')}: {c.sessionIds.length} · {t('courses.capacity')}: {c.capacity}</p>
      <div className="flex flex-wrap gap-2"><Link href={`/provider/courses/edit?id=${c.id}`} className="rounded-xl border border-hairline px-3 py-2 text-sm">{t('courses.edit')}</Link>
        <Button size="sm" onClick={() => { setCourseId(c.id); setSessionId(''); }}>{t('courses.roster')}</Button></div>
    </article>)}</div>
    {query.hasNextPage && <Button onClick={() => query.fetchNextPage()}>{t('courses.more')}</Button>}
    {course && <section className="rounded-2xl border border-hairline bg-surface p-5 space-y-4">
      <h2 className="font-semibold text-xl">{course.name} · {t('courses.sessions')}</h2>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => setOperation('cancelRemaining')}>{t('courses.cancelRemaining')}</Button>
      <label className="block space-y-1">{t('courses.lesson')}<select className={field} value={sessionId} onChange={e => { setSessionId(e.target.value); setOperation(null); }}>
        <option value="">{t('common.select')}</option>{sessions.data?.map(s => <option key={s.id} value={s.id}>{courseDate(s, locale, course.timezone)} · {s.occupied + s.held}/{s.capacity} {s.state === 'cancelled' ? t('courses.cancelled') : ''}</option>)}</select></label>
      {operation === 'cancelRemaining' && <div className="space-y-3"><label className="block">{t('courses.reason')}<input required className={field} value={reason} onChange={e => setReason(e.target.value)} /></label>
        <Button disabled={busy || !reason.trim()} onClick={() => sessionAction().catch(() => setError(t('courses.error')))}>{t('courses.confirm')}</Button></div>}
      {selectedSession && <>
        {selectedSession.state === 'scheduled' && selectedSession.startsAt.toMillis() > Date.now() &&
          <AddCourseParticipant key={selectedSession.id} course={course} session={selectedSession} onAdded={() => { void refresh(); }} />}
        <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={busy || selectedSession.state !== 'scheduled' || selectedSession.startsAt.toMillis() <= Date.now()}
          onClick={() => setOperation('cancel')}>{t('courses.cancelLesson')}</Button>
          <Button variant="outline" size="sm" disabled={busy || selectedSession.state !== 'scheduled' || selectedSession.startsAt.toMillis() <= Date.now()}
            onClick={() => setOperation('reschedule')}>{t('courses.reschedule')}</Button></div>
        {operation && operation !== 'cancelRemaining' && <div className="space-y-3"><label className="block">{t('courses.reason')}<input required className={field} value={reason} onChange={e => setReason(e.target.value)} /></label>
          {operation === 'reschedule' && <label className="block">{t('courses.startDate')} · {course.timezone}<input type="datetime-local" className={field} value={newDate} onChange={e => setNewDate(e.target.value)} /></label>}
          <Button disabled={busy || !reason.trim() || (operation === 'reschedule' && !newDate)} onClick={() => sessionAction().catch(() => setError(t('courses.error')))}>{t('courses.confirm')}</Button></div>}
        {participants.isError && <p role="alert">{t('courses.loadError')}</p>}
        <h3 className="font-semibold">{t('courses.roster')}</h3>
        <ul className="divide-y divide-hairline">{participants.data?.map(p => {
          const enrollment = enrollments.data?.find(e => e.id === p.enrollmentId);
          return <li key={p.id} className="py-4 space-y-2"><div className="flex justify-between flex-wrap gap-2"><span className="font-medium">{p.customerName}</span>
            <span>{enrollment && courseMoney(enrollment.totalCents, locale)} · {t(enrollment?.paymentStatus === 'paid' ? 'courses.paid' : 'courses.pending')}</span></div>
            <div className="flex flex-wrap gap-3 items-center"><label className="text-sm">{t('courses.attendance')}<select className={field} value={p.attendance}
              disabled={busy || p.state !== 'confirmed' || selectedSession.startsAt.toMillis() > Date.now()}
              onChange={e => run('manageCourseSession', { courseId, sessionId, action: 'attendance', userId: p.userId, attendance: e.target.value })}>
              {(['unmarked', 'present', 'absent'] as const).map(v => <option key={v} value={v}>{t(`courses.${v}`)}</option>)}</select></label>
              {enrollment?.paymentMode === 'direct' && enrollment.paymentStatus !== 'paid' && <Button size="sm" disabled={busy} onClick={() => setPayment({ enrollmentId: p.enrollmentId, method: 'cash' })}>{t('courses.recordPayment')}</Button>}
            </div><ParticipantInvitation courseId={courseId} userId={p.userId} /></li>;
        })}</ul>
      </>}
    </section>}
    {refunds.data?.some(r => r.status !== 'completed') && <section className="space-y-3"><h2 className="font-semibold text-xl">{t('courses.refunds')}</h2>
      {refunds.data.filter(r => r.status !== 'completed').map(r => <div key={r.id} className="rounded-xl border border-hairline p-4 flex flex-wrap gap-3 justify-between">
        <span>{t('courses.refundDue')} · {courseMoney(r.amountCents, locale)} · {enrollments.data?.find(e => e.id === r.enrollmentId)?.customerName}</span>
        {r.paymentMode === 'direct' && <Button size="sm" disabled={busy} onClick={() => run('confirmCourseRefund', { refundId: r.id })}>{t('courses.confirmRefund')}</Button>}</div>)}
    </section>}
    {payment && <Modal onClose={() => setPayment(null)} className="w-full max-w-md" ariaLabel={t('courses.recordPayment')}>
      {payment && <div className="p-5 space-y-4"><h2 className="font-semibold">{t('courses.recordPayment')}</h2>
        <label className="block">{t('courses.direct')}<select className={field} value={payment.method} onChange={e => setPayment({ ...payment, method: e.target.value })}>
          {(['cash', 'bank_transfer', 'satispay', 'other'] as const).map(v => <option key={v} value={v}>{t(`courses.${v}`)}</option>)}</select></label>
        <Button disabled={busy} onClick={async () => { if (await run('recordCoursePayment', payment)) setPayment(null); }}>{t('courses.confirm')}</Button>
        <Button variant="ghost" onClick={() => setPayment(null)}>{t('common.close')}</Button></div>}
    </Modal>}
  </div>;
}

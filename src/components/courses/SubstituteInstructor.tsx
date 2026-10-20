'use client';
import { useState } from 'react';
import { courseCall } from '@/lib/firebase/courses';
import { useRefreshCourses } from '@/hooks/useCourses';
import { courseErrorMessage } from '@/lib/courseErrors';
import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/button';
import { InstructorPicker, type InstructorValue } from './InstructorPicker';
import type { Course, CourseSession } from '@/types/course';

/** Another instructor for one lesson only (the course keeps its own). The lesson's lock moves with them, so overlaps are refused. */
export function SubstituteInstructor({ course, session }: { course: Pick<Course, 'id' | 'venueId' | 'instructorId'>; session: Pick<CourseSession, 'id' | 'instructorId'> }) {
  const { t, locale } = useI18n();
  const refresh = useRefreshCourses();
  const [open, setOpen] = useState(false);
  const [instructor, setInstructor] = useState<InstructorValue>({ instructorId: null, name: '' });
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    setBusy(true); setError('');
    try {
      await courseCall('manageCourseSession', { courseId: course.id, sessionId: session.id, action: 'substitute',
        instructorId: instructor.instructorId, ...(reason.trim() ? { reason: reason.trim() } : {}) });
      setOpen(false); setInstructor({ instructorId: null, name: '' }); setReason('');
      await refresh();
    } catch (err) { setError(courseErrorMessage(err, t, locale)); }
    finally { setBusy(false); }
  }
  if (!open) return <Button variant="outline" size="sm" className="min-h-11" onClick={() => setOpen(true)}>{t('courses.substitute')}</Button>;
  return <form className="space-y-3 rounded-xl border border-hairline p-4" onSubmit={e => { e.preventDefault(); void submit(); }}>
    <InstructorPicker mode="substitute" venueId={course.venueId ?? null} currentInstructorId={session.instructorId ?? course.instructorId}
      value={instructor} onChange={setInstructor} />
    <label className="block space-y-1 text-sm">{t('courses.reason')}
      <input className="w-full min-h-11 rounded-xl border border-hairline bg-surface p-3 text-content" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>
    <div className="flex flex-wrap gap-2">
      <Button type="submit" className="min-h-11" disabled={busy || !instructor.instructorId}>{t('courses.substituteConfirm')}</Button>
      <Button type="button" variant="ghost" className="min-h-11" disabled={busy} onClick={() => setOpen(false)}>{t('common.cancel')}</Button></div>
    {error && <p role="alert" className="text-sm text-error">{error}</p>}
  </form>;
}

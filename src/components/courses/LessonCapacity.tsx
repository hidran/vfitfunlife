'use client';
import { useState } from 'react';
import { courseCall } from '@/lib/firebase/courses';
import { useRefreshCourses } from '@/hooks/useCourses';
import { courseErrorMessage } from '@/lib/courseErrors';
import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/button';
import type { CourseSession } from '@/types/course';

const MAX_CAPACITY = 500;

/** Capacity of one lesson. It can grow freely (waiting customers are promoted by the server) and never drop below the seats taken. */
export function LessonCapacity({ courseId, session }: { courseId: string; session: Pick<CourseSession, 'id' | 'capacity' | 'occupied' | 'held'> }) {
  const { t, locale } = useI18n();
  const refresh = useRefreshCourses();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(session.capacity);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setBusy(true); setError('');
    try {
      await courseCall('manageCourseSession', { courseId, sessionId: session.id, action: 'capacity', capacity: value });
      setOpen(false);
      await refresh();
    } catch (err) { setError(courseErrorMessage(err, t, locale)); }
    finally { setBusy(false); }
  }
  if (!open) return <Button variant="outline" size="sm" className="min-h-11" onClick={() => { setValue(session.capacity); setOpen(true); }}>{t('courses.capacityAction')}</Button>;
  return <form className="space-y-3 rounded-xl border border-hairline p-4" onSubmit={e => { e.preventDefault(); void save(); }}>
    <label className="block space-y-1 text-sm">{t('courses.capacity')}
      <input type="number" required className="w-full min-h-11 rounded-xl border border-hairline bg-surface p-3 text-content" min={Math.max(1, session.occupied + session.held)}
        max={MAX_CAPACITY} value={value} onChange={e => setValue(Number(e.target.value))} /></label>
    <div className="flex flex-wrap gap-2">
      <Button type="submit" className="min-h-11" disabled={busy || value === session.capacity}>{t('common.save')}</Button>
      <Button type="button" variant="ghost" className="min-h-11" disabled={busy} onClick={() => setOpen(false)}>{t('common.cancel')}</Button></div>
    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
  </form>;
}

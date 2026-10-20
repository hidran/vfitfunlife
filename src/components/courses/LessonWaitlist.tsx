'use client';
import { useState } from 'react';
import { courseCall } from '@/lib/firebase/courses';
import { useRefreshCourses, useWaitlist } from '@/hooks/useCourses';
import { courseErrorMessage } from '@/lib/courseErrors';
import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/button';

/** Who waits for a seat in one lesson, in position order. Removing an entry renumbers the rest on the server. */
export function LessonWaitlist({ courseId, sessionId }: { courseId: string; sessionId: string }) {
  const { t, locale } = useI18n();
  const waitlist = useWaitlist(courseId, sessionId);
  const refresh = useRefreshCourses();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function remove(userId: string) {
    setBusy(true); setError('');
    try {
      await courseCall('manageCourseSession', { courseId, sessionId, action: 'removeWaitlistEntry', userId });
      setConfirming(null);
      await refresh();
    } catch (err) { setError(courseErrorMessage(err, t, locale)); }
    finally { setBusy(false); }
  }
  const entries = waitlist.data ?? [];
  if (!entries.length) return error ? <p role="alert" className="text-red-500">{error}</p> : null;
  return <section className="space-y-2">
    <h3 className="font-semibold">{t('courses.waitlistTitle')}</h3>
    <ul className="divide-y divide-hairline">{entries.map(e => <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
      <span><span className="mr-2 text-sm text-content-muted">{t('courses.position', { position: e.position })}</span>{e.customerName}</span>
      {confirming === e.userId ? <span className="flex flex-wrap gap-2">
        <Button size="sm" className="min-h-11" disabled={busy} onClick={() => remove(e.userId)}>{t('courses.confirmRemove')}</Button>
        <Button size="sm" variant="ghost" className="min-h-11" disabled={busy} onClick={() => setConfirming(null)}>{t('common.cancel')}</Button></span> :
        <Button size="sm" variant="outline" className="min-h-11" disabled={busy} aria-label={`${t('courses.removeEntry')} ${e.customerName}`}
          onClick={() => setConfirming(e.userId)}>{t('courses.removeEntry')}</Button>}
    </li>)}</ul>
    {error && <p role="alert" className="text-red-500">{error}</p>}
  </section>;
}

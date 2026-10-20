'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import { useMyWaitlist, useRefreshCourses } from '@/hooks/useCourses';
import { useNow } from '@/hooks/useNow';
import { fetchCourse, fetchCourseSessions, leaveCourseWaitlist } from '@/lib/firebase/courses';
import { courseErrorMessage } from '@/lib/courseErrors';
import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/button';
import type { CourseWaitlistEntry } from '@/types/course';

/** The customer's waitlist entries (position, lesson date, Leave). Entries of lessons that already started are hidden. */
export function MyWaitlist({ uid, showEmpty = false }: { uid?: string; /** Say so when there is nothing to list (the customer has no bookings either). */ showEmpty?: boolean }) {
  const { t, locale } = useI18n();
  const waitlist = useMyWaitlist(uid);
  const entries = waitlist.data ?? [];
  const now = useNow();
  const refresh = useRefreshCourses();
  const courseIds = [...new Set(entries.map(e => e.courseId))];
  // Same keys as the course page: the lesson time is not on the entry, so it is read from the course's lessons.
  const lessons = useQueries({ queries: courseIds.map(id => ({ queryKey: ['courses', 'sessions', id], queryFn: () => fetchCourseSessions(id) })) });
  const details = useQueries({ queries: courseIds.map(id => ({ queryKey: ['courses', 'detail', id], queryFn: () => fetchCourse(id) })) });
  const settling = waitlist.isLoading || lessons.some(q => q.isLoading);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const rows = entries.flatMap(entry => {
    const index = courseIds.indexOf(entry.courseId);
    const query = lessons[index];
    if (query?.isError) return [{ entry, startsAt: null as Date | null }]; // can still be left
    const session = query?.data?.find(s => s.id === entry.sessionId);
    return session && session.startsAt.toMillis() > now ? [{ entry, startsAt: session.startsAt.toDate() }] : [];
  });
  // Entries of lessons that already started are not shown, so "nothing to show" can hold with a non-empty list.
  if (!rows.length) return showEmpty && !settling ? <p className="text-content-muted">{t('courses.emptyBookings')}</p> : null;

  const key = (e: CourseWaitlistEntry) => `${e.courseId}_${e.sessionId}`;
  async function leave(entry: CourseWaitlistEntry) {
    setBusy(true); setError('');
    try { await leaveCourseWaitlist(entry.courseId, entry.sessionId); setConfirming(null); await refresh(); }
    catch (err) { setError(courseErrorMessage(err, t, locale)); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3" aria-label={t('courses.waitlistSection')}>
    <h2 className="text-xl font-semibold">{t('courses.waitlistSection')}</h2>
    <ul className="space-y-3">{rows.map(({ entry, startsAt }) => {
      // No time zone, no time: a guessed zone would show the wrong hour.
      const timezone = details[courseIds.indexOf(entry.courseId)]?.data?.timezone;
      return <li key={key(entry)} className="space-y-2 rounded-2xl border border-hairline bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Link className="text-lg font-semibold underline-offset-4 hover:underline" href={`/courses?id=${encodeURIComponent(entry.courseId)}`}>{entry.courseName}</Link>
          <span className="text-sm font-medium text-section-ink">{t('courses.position', { position: entry.position })}</span></div>
        {startsAt && timezone && <p className="text-sm text-content-muted">{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(startsAt)}</p>}
        {confirming === key(entry) ? <div className="flex flex-wrap gap-2"><p className="w-full">{t('courses.leaveWaitlistConfirm')}</p>
          <Button size="sm" className="min-h-11" disabled={busy} onClick={() => leave(entry)}>{t('courses.confirm')}</Button>
          <Button size="sm" variant="ghost" className="min-h-11" disabled={busy} onClick={() => setConfirming(null)}>{t('common.cancel')}</Button></div> :
          <Button size="sm" variant="outline" className="min-h-11" disabled={busy} onClick={() => setConfirming(key(entry))}>{t('courses.leaveWaitlist')}</Button>}
      </li>;
    })}</ul>
    {error && <p role="alert" className="text-error">{error}</p>}
  </section>;
}

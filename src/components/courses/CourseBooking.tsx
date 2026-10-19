'use client';
import { useState, useEffect } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/button';
import type { Course, CourseSession } from '@/types/course';
export const courseMoney = (cents: number, locale: string) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(cents / 100);
export const courseDate = (s: CourseSession, locale: string, timezone: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(s.startsAt.toDate());
export function CourseBooking({ course, sessions, checkoutEnabled, onBook, busy }: {
  course: Course; sessions: CourseSession[]; checkoutEnabled: boolean; busy: boolean;
  onBook: (scope: 'lesson' | 'series', sessionId: string | undefined, payment: 'direct' | 'stripe') => void;
}) {
  const { t, locale } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const [payment, setPayment] = useState<'direct' | 'stripe'>('direct');
  const available = (s: CourseSession) => s.state === 'scheduled' && s.capacity > s.occupied + s.held &&
    s.startsAt.toMillis() > now + course.bookingNoticeHours * 3600000 &&
    course.state === 'published' && !course.enrollmentClosed;
  const effectivePayment = checkoutEnabled ? payment : 'direct';
  const seriesAvailable = course.firstStartsAt.toMillis() > now &&
    sessions.length === course.sessionIds.length && sessions.every(available);
  return <div className="space-y-4">
    <p className="text-sm text-content-muted">{t('courses.terms', { hours: course.cancellationHours })}</p>
    {checkoutEnabled ? <fieldset className="flex flex-wrap gap-4"><legend className="sr-only">{t('courses.pay')}</legend>
      <label className="flex gap-2"><input type="radio" name="course-payment" checked={payment === 'direct'} onChange={() => setPayment('direct')} />{t('courses.direct')}</label>
      <label className="flex gap-2"><input type="radio" name="course-payment" checked={payment === 'stripe'} onChange={() => setPayment('stripe')} />{t('courses.online')}</label>
    </fieldset> : <p className="text-sm">{t('courses.direct')}</p>}
    {course.seriesPriceCents !== null && <div className="rounded-xl border border-hairline p-4 space-y-2">
      <Button className="w-full" disabled={busy || !seriesAvailable} onClick={() => onBook('series', undefined, effectivePayment)}>
        {t('courses.series')} · {courseMoney(course.seriesPriceCents, locale)}
      </Button><p className="text-sm text-content-muted">{t('courses.seriesHint')}</p>
    </div>}
    <h3 className="font-semibold">{t('courses.sessions')}</h3>
    <ul className="divide-y divide-hairline">{sessions.map(s => <li key={s.id} className="py-4 flex flex-wrap items-center justify-between gap-3">
      <div><p className="font-medium">{courseDate(s, locale, course.timezone)}</p>
        <p className="text-sm text-content-muted">{s.location} · {s.instructor}</p>
        <p className="text-sm">{s.state === 'cancelled' ? t('courses.cancelled') :
          `${t('courses.spots')}: ${Math.max(0, s.capacity - s.occupied - s.held)} / ${s.capacity}`}</p></div>
      {course.lessonPriceCents !== null && <Button size="sm" variant="outline" disabled={busy || !available(s)}
        onClick={() => onBook('lesson', s.id, effectivePayment)}>
        {t('courses.bookLesson')} · {courseMoney(course.lessonPriceCents, locale)}
      </Button>}
    </li>)}</ul>
  </div>;
}

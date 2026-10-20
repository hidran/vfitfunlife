'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Users, MapPin, CalendarDays } from 'lucide-react';
import { useCourses } from '@/hooks/useCourses';
import { useAuthStore } from '@/stores/authStore';
import { useServiceCategoryLeaves } from '@/hooks/useServiceCategories';
import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/button';
import { courseHref, coursePrice } from '@/lib/courseFormat';
import { CourseEnrollments } from '@/components/courses/CourseEnrollments';

export default function CoursesPage() {
  return <Suspense><CoursesContent /></Suspense>;
}

function CoursesContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { t, locale } = useI18n();
  const uid = useAuthStore(s => s.firebaseUser?.uid);
  const query = useCourses();
  const categories = useServiceCategoryLeaves();
  const [tab, setTab] = useState<'browse' | 'bookings'>(() => params?.get('tab') === 'bookings' ? 'bookings' : 'browse');
  const [nowMs, setNowMs] = useState(() => Date.now());
  // A booking completed on the course page comes back here to name the outcome.
  const justBooked = params?.get('booked') === '1';
  useEffect(() => { const timer = setInterval(() => setNowMs(Date.now()), 60000); return () => clearInterval(timer); }, []);
  // Older links (`/courses?id=…`, emails and notifications sent before the detail page) still open the course.
  const linkedId = params?.get('id') ?? '';
  const linkedLesson = params?.get('lesson') ?? '';
  useEffect(() => {
    if (!linkedId) return;
    router.replace(courseHref(linkedId, linkedLesson || undefined));
  }, [linkedId, linkedLesson, router]);
  const [category, setCategory] = useState('');
  const [city, setCity] = useState('');
  const [date, setDate] = useState('');
  const [price, setPrice] = useState('');
  const courses = query.data?.pages.flatMap(p => p.courses).filter(c => {
    const enabledPrices = [c.lessonPriceCents, c.seriesPriceCents].filter((n): n is number => n !== null);
    return (!category || c.categoryIds.includes(category)) && (!city || `${c.city} ${c.location}`.toLowerCase().includes(city.toLowerCase())) &&
      (!date || c.nextStartsAt.toDate() >= new Date(date)) && (!price || Math.min(...enabledPrices) <= Number(price) * 100) &&
      c.nextStartsAt.toMillis() > nowMs;
  }) ?? [];
  const field = 'w-full rounded-xl border border-hairline bg-surface px-3 py-2 text-content';
  return <div className="mx-auto max-w-5xl p-4 md:p-8 space-y-6 pb-24">
    <header className="space-y-2"><h1 className="text-2xl sm:text-3xl font-display font-bold break-words">{t('courses.title')}</h1>
      <div className="flex gap-2"><Button variant={tab === 'browse' ? 'primary' : 'outline'} onClick={() => setTab('browse')}>{t('courses.browse')}</Button>
        <Button variant={tab === 'bookings' ? 'primary' : 'outline'} onClick={() => setTab('bookings')}>{t('courses.myBookings')}</Button></div></header>
    {justBooked && tab === 'bookings' && <p role="status" className="text-success">{t('courses.booked')}</p>}
    {tab === 'bookings' ? <CourseEnrollments uid={uid} /> : <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <label className="text-sm space-y-1">{t('courses.category')}<select className={field} value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">{t('courses.allCategories')}</option>{categories.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
        <label className="text-sm space-y-1">{t('courses.city')}<input className={field} value={city} onChange={e => setCity(e.target.value)} /></label>
        <label className="text-sm space-y-1">{t('courses.fromDate')}<input className={field} type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label className="text-sm space-y-1">{t('courses.maxPrice')}<input className={field} type="number" min="0" value={price} onChange={e => setPrice(e.target.value)} /></label>
      </div>
      {query.isLoading && <p>{t('common.loading')}</p>}
      {query.isError && <p role="alert">{t('courses.loadError')} <Button onClick={() => query.refetch()}>{t('common.retry')}</Button></p>}
      {!query.isLoading && !query.isError && !courses.length && <p className="text-content-muted">{t('courses.empty')}</p>}
      <div className="grid md:grid-cols-2 gap-4">{courses.map(c => <article key={c.id} className="rounded-2xl border border-hairline bg-surface p-5 space-y-3">
        <h2 className="text-xl font-semibold">{c.name}</h2><p className="text-sm text-content-muted">{c.providerName} · {c.level}</p>
        <p className="flex items-center gap-2 text-sm"><MapPin size={16} />{c.location}</p>
        <p className="flex items-center gap-2 text-sm"><CalendarDays size={16} />{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: c.timezone }).format(c.nextStartsAt.toDate())}</p>
        <p className="flex items-center gap-2 text-sm"><Users size={16} />{t('courses.spots')}: {Math.max(0, c.nextAvailableSeats ?? c.capacity)} / {c.capacity}</p>
        <div className="flex flex-wrap gap-3 text-sm">{c.lessonPriceCents !== null && <span>{t('courses.lesson')}: {coursePrice(c.lessonPriceCents, locale, t('courses.free'))}</span>}
          {c.seriesPriceCents !== null && <span>{t('courses.series')}: {coursePrice(c.seriesPriceCents, locale, t('courses.free'))}</span>}</div>
        <Link href={courseHref(c.id)} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-hairline px-4 py-2 font-semibold text-section-ink">{t('courses.sessions')}</Link>
      </article>)}</div>
      {query.hasNextPage && <Button disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>{t('courses.more')}</Button>}
    </>}
  </div>;
}

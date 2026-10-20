'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Users, MapPin, CalendarDays } from 'lucide-react';
import { useCourses, useCourseSessions } from '@/hooks/useCourses';
import { fetchCourse } from '@/lib/firebase/courses';
import { useAuthStore } from '@/stores/authStore';
import { usePaymentSettings } from '@/hooks/usePaymentSettings';
import { useServiceCategoryLeaves } from '@/hooks/useServiceCategories';
import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/Modal';
import { CourseBooking } from '@/components/courses/CourseBooking';
import { coursePrice } from '@/lib/courseFormat';
import { CourseEnrollments } from '@/components/courses/CourseEnrollments';
import type { Course } from '@/types/course';
export default function CoursesPage() {
  return <Suspense><CoursesContent /></Suspense>;
}

function CoursesContent() {
  const params = useSearchParams();
  const { t, locale } = useI18n();
  const uid = useAuthStore(s => s.firebaseUser?.uid);
  const query = useCourses();
  const categories = useServiceCategoryLeaves();
  const payments = usePaymentSettings();
  const [tab, setTab] = useState<'browse' | 'bookings'>(() => params?.get('tab') === 'bookings' ? 'bookings' : 'browse');
  const [picked, setPicked] = useState<Course | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNowMs(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const [linkedId, setLinkedId] = useState(() => params?.get('id') ?? '');
  const [linkedLesson, setLinkedLesson] = useState(() => params?.get('lesson') ?? '');
  const [category, setCategory] = useState('');
  const [city, setCity] = useState('');
  const [date, setDate] = useState('');
  const [price, setPrice] = useState('');
  const [success, setSuccess] = useState('');
  const linked = useQuery({ queryKey: ['courses', 'detail', linkedId], queryFn: () => fetchCourse(linkedId), enabled: !!linkedId });
  // The course opened from a link (?id=) until the user picks or closes one.
  const selected = picked ?? (linkedId ? linked.data ?? null : null);
  const sessions = useCourseSessions(selected?.id);
  const courses = query.data?.pages.flatMap(p => p.courses).filter(c => {
    const enabledPrices = [c.lessonPriceCents, c.seriesPriceCents].filter((n): n is number => n !== null);
    return (!category || c.categoryIds.includes(category)) && (!city || `${c.city} ${c.location}`.toLowerCase().includes(city.toLowerCase())) &&
      (!date || c.nextStartsAt.toDate() >= new Date(date)) && (!price || Math.min(...enabledPrices) <= Number(price) * 100) &&
      c.nextStartsAt.toMillis() > nowMs;
  }) ?? [];
  function closeSheet() { setPicked(null); setLinkedId(''); setLinkedLesson(''); }
  function booked() { setSuccess(t('courses.booked')); closeSheet(); setTab('bookings'); }
  const field = 'w-full rounded-xl border border-hairline bg-surface px-3 py-2 text-content';
  return <div className="mx-auto max-w-5xl p-4 md:p-8 space-y-6 pb-24">
    <header className="space-y-2"><h1 className="text-3xl font-display font-bold">{t('courses.title')}</h1>
      <div className="flex gap-2"><Button variant={tab === 'browse' ? 'primary' : 'outline'} onClick={() => setTab('browse')}>{t('courses.browse')}</Button>
        <Button variant={tab === 'bookings' ? 'primary' : 'outline'} onClick={() => setTab('bookings')}>{t('courses.myBookings')}</Button></div></header>
    {success && <p role="status" className="text-emerald-500">{success}</p>}
    {tab === 'bookings' ? <CourseEnrollments uid={uid} /> : <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <label className="text-sm space-y-1">{t('courses.category')}<select className={field} value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">{t('courses.allCategories')}</option>{categories.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
        <label className="text-sm space-y-1">{t('courses.city')}<input className={field} value={city} onChange={e => setCity(e.target.value)} /></label>
        <label className="text-sm space-y-1">{t('courses.fromDate')}<input className={field} type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label className="text-sm space-y-1">{t('courses.maxPrice')}<input className={field} type="number" min="0" value={price} onChange={e => setPrice(e.target.value)} /></label>
      </div>
      {query.isLoading && <p>{t('common.loading')}</p>}
      {(query.isError || linked.isError) && <p role="alert">{t('courses.loadError')} <Button onClick={() => query.refetch()}>{t('common.retry')}</Button></p>}
      {!query.isLoading && !query.isError && !courses.length && <p className="text-content-muted">{t('courses.empty')}</p>}
      <div className="grid md:grid-cols-2 gap-4">{courses.map(c => <article key={c.id} className="rounded-2xl border border-hairline bg-surface p-5 space-y-3">
        <h2 className="text-xl font-semibold">{c.name}</h2><p className="text-sm text-content-muted">{c.providerName} · {c.level}</p>
        <p className="flex items-center gap-2 text-sm"><MapPin size={16} />{c.location}</p>
        <p className="flex items-center gap-2 text-sm"><CalendarDays size={16} />{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: c.timezone }).format(c.nextStartsAt.toDate())}</p>
        <p className="flex items-center gap-2 text-sm"><Users size={16} />{t('courses.spots')}: {Math.max(0, c.nextAvailableSeats ?? c.capacity)} / {c.capacity}</p>
        <div className="flex flex-wrap gap-3 text-sm">{c.lessonPriceCents !== null && <span>{t('courses.lesson')}: {coursePrice(c.lessonPriceCents, locale, t('courses.free'))}</span>}
          {c.seriesPriceCents !== null && <span>{t('courses.series')}: {coursePrice(c.seriesPriceCents, locale, t('courses.free'))}</span>}</div>
        <Button className="w-full" variant="outline" onClick={() => setPicked(c)}>{t('courses.sessions')}</Button>
      </article>)}</div>
      {query.hasNextPage && <Button disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>{t('courses.more')}</Button>}
    </>}
    {selected && <Modal onClose={closeSheet} className="w-full max-w-2xl" ariaLabel={selected.name}>
      <div className="p-5 space-y-4 text-content"><div className="flex justify-between gap-3"><h2 className="font-display text-2xl font-bold">{selected.name}</h2>
        <Button variant="ghost" className="min-h-11" onClick={closeSheet}>{t('common.close')}</Button></div>
        <p>{selected.description}</p><p className="text-sm">{selected.equipment}</p>
        {sessions.isLoading ? <p>{t('common.loading')}</p> : sessions.isError ? <p role="alert">{t('courses.loadError')}</p> :
          <CourseBooking course={selected} sessions={sessions.data ?? []} checkoutEnabled={payments.courseCheckoutEnabled && !payments.isLoading}
            uid={uid} initialSessionId={linkedLesson || undefined} onBooked={booked} />}
      </div>
    </Modal>}
  </div>;
}

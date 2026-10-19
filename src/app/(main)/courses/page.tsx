'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, MapPin, CalendarDays } from 'lucide-react';
import { useCourses, useCourseSessions, useRefreshCourses } from '@/hooks/useCourses';
import { fetchCourse, courseCall } from '@/lib/firebase/courses';
import { useAuthStore } from '@/stores/authStore';
import { usePaymentSettings } from '@/hooks/usePaymentSettings';
import { useServiceCategoryLeaves } from '@/hooks/useServiceCategories';
import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/Modal';
import { CourseBooking, courseMoney, courseDate } from '@/components/courses/CourseBooking';
import { CourseEnrollments } from '@/components/courses/CourseEnrollments';
import type { Course } from '@/types/course';
export default function CoursesPage() {
  const { t, locale } = useI18n();
  const uid = useAuthStore(s => s.firebaseUser?.uid);
  const query = useCourses();
  const categories = useServiceCategoryLeaves();
  const refresh = useRefreshCourses();
  const payments = usePaymentSettings();
  const [tab, setTab] = useState<'browse' | 'bookings'>('browse');
  const [selected, setSelected] = useState<Course | null>(null);
  const [linkedId, setLinkedId] = useState('');
  const [category, setCategory] = useState('');
  const [city, setCity] = useState('');
  const [date, setDate] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [review, setReview] = useState<{ scope: 'lesson' | 'series'; sessionId?: string; paymentMode: 'direct' | 'stripe'; requestId: string } | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'bookings') setTab('bookings');
    setLinkedId(params.get('id') ?? '');
  }, []);
  const linked = useQuery({ queryKey: ['courses', 'detail', linkedId], queryFn: () => fetchCourse(linkedId), enabled: !!linkedId });
  useEffect(() => { if (linked.data) setSelected(linked.data); }, [linked.data]);
  const sessions = useCourseSessions(selected?.id);
  const courses = query.data?.pages.flatMap(p => p.courses).filter(c => {
    const enabledPrices = [c.lessonPriceCents, c.seriesPriceCents].filter((n): n is number => n !== null);
    return (!category || c.categoryIds.includes(category)) && (!city || `${c.city} ${c.location}`.toLowerCase().includes(city.toLowerCase())) &&
      (!date || c.nextStartsAt.toDate() >= new Date(date)) && (!price || Math.min(...enabledPrices) <= Number(price) * 100) &&
      c.nextStartsAt.toMillis() > Date.now();
  }) ?? [];
  async function confirmBooking() {
    if (!selected || !review) return;
    if (!uid) { window.location.assign('/auth/login'); return; }
    setBusy(true); setError('');
    try {
      const result = await courseCall<{ enrollmentId: string }>('enrollInCourse', { courseId: selected.id, ...review });
      if (review.paymentMode === 'stripe') {
        const checkout = await courseCall<{ url: string }>('createCourseCheckout', { enrollmentId: result.enrollmentId });
        window.location.assign(checkout.url);
      }
      setSuccess(t('courses.booked')); setReview(null); setSelected(null); setLinkedId(''); setTab('bookings'); await refresh();
    } catch (err) { setError(`${t('courses.error')} ${err instanceof Error ? err.message : ''}`); }
    finally { setBusy(false); }
  }
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
        <div className="flex flex-wrap gap-3 text-sm">{c.lessonPriceCents !== null && <span>{t('courses.lesson')}: {courseMoney(c.lessonPriceCents, locale)}</span>}
          {c.seriesPriceCents !== null && <span>{t('courses.series')}: {courseMoney(c.seriesPriceCents, locale)}</span>}</div>
        <Button className="w-full" variant="outline" onClick={() => { setSelected(c); setError(''); }}>{t('courses.sessions')}</Button>
      </article>)}</div>
      {query.hasNextPage && <Button disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>{t('courses.more')}</Button>}
    </>}
    {selected && <Modal onClose={() => { if (!busy) { setSelected(null); setLinkedId(''); setReview(null); } }} className="w-full max-w-2xl" ariaLabel={selected?.name}>
      {selected && <div className="p-5 space-y-4 text-content"><div className="flex justify-between gap-3"><h2 className="font-display text-2xl font-bold">{selected.name}</h2>
        <Button variant="ghost" onClick={() => { setSelected(null); setLinkedId(''); setReview(null); }} disabled={busy}>{t('common.close')}</Button></div>
        <p>{selected.description}</p><p className="text-sm">{selected.equipment}</p>
        {sessions.isLoading ? <p>{t('common.loading')}</p> : sessions.isError ? <p role="alert">{t('courses.loadError')}</p> :
          <CourseBooking course={selected} sessions={sessions.data ?? []} checkoutEnabled={payments.courseCheckoutEnabled && !payments.isLoading}
            busy={busy || !!review} onBook={(scope, sessionId, paymentMode) => { setError(''); setReview({ scope, sessionId, paymentMode, requestId: crypto.randomUUID() }); }} />}
        {review && <section className="border-t border-hairline pt-4 space-y-3" aria-label={t('courses.review')}>
          <h3 className="font-semibold">{t('courses.review')}</h3><p>{t(`courses.${review.scope}`)} · {courseMoney((review.scope === 'series' ? selected.seriesPriceCents : selected.lessonPriceCents) ?? 0, locale)}</p>
          <ul>{sessions.data?.filter(s => review.scope === 'series' || s.id === review.sessionId).map(s => <li key={s.id}>{courseDate(s, locale, selected.timezone)}</li>)}</ul>
          <p>{t(review.paymentMode === 'direct' ? 'courses.direct' : 'courses.online')}</p>
          <Button onClick={confirmBooking} disabled={busy}>{t('courses.confirm')}</Button>
          <Button variant="ghost" disabled={busy} onClick={() => setReview(null)}>{t('common.cancel')}</Button>
        </section>}
        {error && <p role="alert" className="text-red-500">{error}</p>}
      </div>}
    </Modal>}
  </div>;
}

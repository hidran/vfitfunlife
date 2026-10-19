'use client';
import Link from 'next/link';
import { useI18n } from '@/hooks/useI18n';
import { courseMoney } from './CourseBooking';
import type { Course } from '@/types/course';
import type { SearchParams } from '@/types/booking';

export function filterActivityCourses(courses: Course[], filters: SearchParams): Course[] {
  const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const query = normalize(filters.query?.trim() ?? '');
  const matches = courses.filter(course => {
    if (course.state !== 'published' || !course.providerEligible || course.enrollmentClosed) return false;
    if (filters.category && course.categoryId !== filters.category && !course.categoryIds.includes(filters.category)) return false;
    if (query && ![course.name, course.description, course.instructor, course.providerName, course.city, course.location]
      .some(value => normalize(value ?? '').includes(query))) return false;
    const price = (course.lessonPriceCents ?? course.seriesPriceCents ?? 0) / 100;
    return (filters.minPrice === undefined || price >= filters.minPrice) && (filters.maxPrice === undefined || price <= filters.maxPrice);
  });
  return filters.sortBy === 'price' ? matches.sort((a, b) =>
    (a.lessonPriceCents ?? a.seriesPriceCents ?? 0) - (b.lessonPriceCents ?? b.seriesPriceCents ?? 0)) : matches;
}

export function CourseSearchResults({ courses }: { courses: Course[] }) {
  const { t, locale } = useI18n();
  if (!courses.length) return null;
  return <section className="space-y-4" aria-label={t('courses.title')}>
    <h2 className="text-xl font-semibold text-content">{t('courses.title')}</h2>
    <div className="grid gap-4 md:grid-cols-2">{courses.map(course => <article key={course.id}
      className="rounded-2xl border border-hairline bg-surface p-5 space-y-3 text-content">
      <h3 className="text-lg font-semibold">{course.name}</h3>
      <p className="text-sm text-content-muted">{course.providerName} · {course.location}</p>
      <p className="text-sm">{t('courses.lesson')} · {t('courses.spots')}: {Math.max(0, course.nextAvailableSeats ?? course.capacity)} / {course.capacity}</p>
      <div className="flex flex-wrap gap-3 text-sm">
        {course.lessonPriceCents !== null && <span>{t('courses.lesson')}: {courseMoney(course.lessonPriceCents, locale)}</span>}
        {course.seriesPriceCents !== null && <span>{t('courses.series')}: {courseMoney(course.seriesPriceCents, locale)}</span>}
      </div>
      <Link href={`/courses?id=${encodeURIComponent(course.id)}`}
        className="inline-flex rounded-xl border border-hairline px-4 py-2 font-semibold text-section-primary">{t('courses.sessions')}</Link>
    </article>)}</div>
  </section>;
}

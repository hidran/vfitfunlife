'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, Clock, MapPin, Star } from 'lucide-react';
import { cn, formatDecimal, formatPrice } from '@/lib/utils';
import { useVenue, useVenueServices } from '@/hooks/useVenues';
import { useCoursesById, useVenueNextLessons } from '@/hooks/useCourses';
import { amenityIcon } from '@/lib/icons/amenityIcons';
import { VenueNotFound } from '@/components/venue/VenueNotFound';
import { Spinner } from '@/components/ui/Spinner';
import { PhotoGallery } from '@/components/gallery/PhotoGallery';
import { useI18n } from '@/hooks/useI18n';
import { hostsCourses } from '@/types/venue';

export default function VenueDetailClient() {
  const searchParams = useSearchParams();
  const { t, locale } = useI18n();
  const id = searchParams?.get('id') ?? undefined;

  const venueQuery = useVenue(id);
  const servicesQuery = useVenueServices(id);
  // The lesson queries are only allowed (and only useful) for an active partner venue that hosts courses.
  const listsCourses = !!venueQuery.data && hostsCourses(venueQuery.data.type) &&
    venueQuery.data.partnerStatus === 'active' && venueQuery.data.isActive !== false;
  const nextLessons = useVenueNextLessons(listsCourses ? id : undefined, 3);
  // Lessons carry their course name and time zone; only older ones (before the backfill) need their course read, once.
  const unlabelled = useMemo(() => [...new Set((nextLessons.data ?? []).flatMap((l) =>
    l.courseId && (!l.courseName || !l.timezone) ? [l.courseId] : []))].sort(), [nextLessons.data]);
  const fallbackCourses = useCoursesById(unlabelled, listsCourses);

  const [activeSlide, setActiveSlide] = useState(0);
  const [showAllHours, setShowAllHours] = useState(false);
  const [showDescription, setShowDescription] = useState(false);

  if (!id) {
    return <VenueNotFound message={t('venueDetail.error.noId')} />;
  }

  if (venueQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background-dark">
        <Spinner size="md" />
      </div>
    );
  }

  const venue = venueQuery.data;
  if (!venue) {
    return <VenueNotFound onRetry={() => venueQuery.refetch()} />;
  }

  const slides = venue.heroGradients ?? [];
  const services = servicesQuery.data ?? [];
  const lessons = (nextLessons.data ?? []).flatMap((l) => {
    const older = l.courseId ? fallbackCourses.map.get(l.courseId) : undefined;
    const name = l.courseName || older?.name;
    return l.courseId && name ? [{ lesson: l, courseId: l.courseId, name, timezone: l.timezone || older?.timezone }] : [];
  });
  const hours = venue.hours ?? [];
  const visibleHours = showAllHours ? hours : hours.slice(0, 1);

  return (
    <div className="min-h-screen bg-background-dark pb-24">
      <div className="relative">
        <div className="absolute left-4 top-4 z-10">
          <Link
            href="/fit/gyms"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-background-dark/80 text-text-inverse"
            aria-label={t('venueDetail.back.aria')}
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </div>

        {venue.photoUrls && venue.photoUrls.length > 0 ? (
          <div className="px-4 pt-4">
            <PhotoGallery photos={venue.photoUrls} />
          </div>
        ) : (
          <div className="relative h-72 overflow-hidden">
            {slides.map((gradient, idx) => (
              <div
                key={idx}
                className={cn(
                  'absolute inset-0 bg-gradient-to-br transition-opacity duration-500',
                  gradient,
                  activeSlide === idx ? 'opacity-100' : 'opacity-0'
                )}
                onClick={() => setActiveSlide((activeSlide + 1) % Math.max(slides.length, 1))}
              />
            ))}
          </div>
        )}
      </div>

      <div className="-mt-6 rounded-t-3xl bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-content">{venue.name}</h1>
            <p className="mt-1 inline-flex items-center gap-1 text-sm text-content-muted">
              <MapPin className="h-3.5 w-3.5" />
              {venue.address}
            </p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2 py-1 text-xs font-semibold text-yellow-700">
            <Star className="h-3.5 w-3.5 fill-current" />
            {formatDecimal(venue.rating, locale, 1)} <span className="text-yellow-600/70">({venue.reviewCount})</span>
          </div>
        </div>

        {hours.length > 0 && (
          <div className="mt-4 rounded-2xl border border-hairline bg-content/5 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-content/80">
              <Clock className="h-4 w-4" /> {t('venueDetail.hours.title')}
            </div>
            <ul className="mt-2 space-y-1 text-sm text-content/80">
              {visibleHours.map((h) => (
                <li key={h.day} className="flex justify-between">
                  <span>{h.day}</span>
                  <span>{h.time}</span>
                </li>
              ))}
            </ul>
            {hours.length > 1 && (
              <button
                type="button"
                onClick={() => setShowAllHours((v) => !v)}
                className="mt-2 text-xs font-medium text-vfit-accent light:text-violet-700"
              >
                {showAllHours ? t('venueDetail.hours.showLess') : t('venueDetail.hours.showAll', { count: hours.length })}
              </button>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {(venue.amenities ?? []).map((a) => {
            const Icon = amenityIcon(a.kind);
            return (
              <span
                key={a.kind}
                className="inline-flex items-center gap-1 rounded-full bg-content/5 px-3 py-1 text-xs font-medium text-content/80"
              >
                <Icon className="h-3.5 w-3.5" /> {a.kind.replace(/_/g, ' ')}
              </span>
            );
          })}
        </div>

        <p className={cn('mt-4 text-sm text-content/80', !showDescription && 'line-clamp-3')}>
          {venue.description}
        </p>
        {venue.description.length > 160 && (
          <button
            type="button"
            onClick={() => setShowDescription((v) => !v)}
            className="mt-1 text-xs font-medium text-vfit-accent light:text-violet-700"
          >
            {showDescription ? t('venueDetail.description.showLess') : t('venueDetail.description.readAll')}
          </button>
        )}

        {hostsCourses(venue.type) && venue.partnerStatus === 'active' && <Link
          href={`/fit/gyms/timetable?id=${venue.id}`}
          className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-section-primary px-5 font-semibold text-white">
          {t('gym.timetable')}
        </Link>}

        <section className="mt-6 space-y-3" aria-label={t('venueDetail.tab.services')}>
          <h2 className="border-b border-hairline pb-2 text-sm font-semibold text-vfit-accent light:text-violet-700">
            {t('venueDetail.tab.services')}
          </h2>
          <ul className="space-y-2">
            {servicesQuery.isLoading && <Spinner size="sm" />}
            {services.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-xl border border-hairline bg-surface p-3"
              >
                <span className="text-sm font-medium text-content">{s.name}</span>
                <span className="text-sm font-semibold text-content">{formatPrice(s.price, locale)}</span>
              </li>
            ))}
            {!servicesQuery.isLoading && services.length === 0 && (
              <li className="text-sm text-content-muted">{t('venueDetail.services.empty')}</li>
            )}
          </ul>
        </section>

        {listsCourses && lessons.length > 0 && (
          <section className="mt-6 space-y-3" aria-label={t('venue.nextLessons')}>
            <h2 className="border-b border-hairline pb-2 text-sm font-semibold text-vfit-accent light:text-violet-700">
              {t('venue.nextLessons')}
            </h2>
            <ul className="space-y-2">
              {lessons.map(({ lesson: l, courseId, name, timezone }) => {
                // No time zone known (older lesson whose course could not be read): say who, not a guessed time.
                const when = timezone ? new Intl.DateTimeFormat(locale, {
                  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: timezone,
                }).format(l.startsAt.toDate()) : '';
                const who = l.instructorName || l.instructor;
                return (
                  <li key={`${courseId}_${l.id}`}>
                    <Link
                      href={`/courses?id=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(l.id)}`}
                      className="flex min-h-11 flex-col rounded-xl border border-hairline bg-surface p-3"
                    >
                      <span className="text-sm font-semibold text-content">{name}</span>
                      <span className="text-xs text-content-muted">{[when, who].filter(Boolean).join(' · ')}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Link
              href={`/fit/gyms/timetable?id=${encodeURIComponent(venue.id)}`}
              className="inline-flex min-h-11 items-center text-sm font-semibold text-vfit-accent light:text-violet-700"
            >
              {t('venue.fullTimetable')}
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}

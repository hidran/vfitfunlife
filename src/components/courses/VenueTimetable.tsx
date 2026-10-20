'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQueries, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useVenue } from '@/hooks/useVenues';
import { useVenueWeek, useCoursesById } from '@/hooks/useCourses';
import { useManagedVenues } from '@/hooks/useManagedVenues';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/hooks/useI18n';
import { useNow } from '@/hooks/useNow';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { quoteCourse } from '@/lib/firebase/courses';
import { fetchVenueLocations, fetchVenueRooms } from '@/lib/firebase/venueSpaces';
import { addDays, dayLabel, localDay, weekStart } from '@/lib/gymTime';
import { filterLessons, instructorKey, instructorLabel, lessonTime, NO_FILTERS, weekLessons, type TimetableFilters, type TimetableLesson } from '@/lib/venueTimetable';
import { cn } from '@/lib/utils';
import { TimetableCard } from './TimetableCard';
import type { Course, SessionQuote } from '@/types/course';

/** Quotes are rate limited (60 per 10 minutes): one view never asks for more than this many courses. */
const MAX_QUOTED_COURSES = 8;
/** Week and day changes settle for this long before any quote is requested. */
const QUOTE_SETTLE_MS = 350;
const select = 'w-full min-h-11 rounded-xl border border-hairline bg-surface px-3 py-2 text-content';

/** Public weekly timetable of a venue (`?id=`): seven columns on desktop, day tabs on a phone. */
export function VenueTimetable() {
  const venueId = useSearchParams()?.get('id') ?? '';
  const { t, locale } = useI18n();
  const uid = useAuthStore(s => s.firebaseUser?.uid);
  const role = useAuthStore(s => s.user?.role);
  const venue = useVenue(venueId || undefined);
  const managed = useManagedVenues();
  const open = !!venue.data && venue.data.partnerStatus === 'active' && venue.data.isActive !== false;
  const canManage = !!venueId && (managed.venues.some(v => v.id === venueId) || role === 'admin' || role === 'superadmin');

  const locations = useQuery({ queryKey: ['venueSpaces', venueId, 'locations'], enabled: !!venueId && open,
    queryFn: () => fetchVenueLocations(venueId) });
  const activeLocations = useMemo(() => (locations.data ?? []).filter(l => l.isActive), [locations.data]);
  const roomQueries = useQueries({ queries: activeLocations.map(l => ({
    queryKey: ['venueSpaces', venueId, 'rooms', l.id], queryFn: () => fetchVenueRooms(venueId, l.id) })) });
  const rooms = useMemo(() => activeLocations.flatMap((l, i) =>
    (roomQueries[i]?.data ?? []).map(r => ({ ...r, locationId: l.id }))),
  // The query array is a new object each render; its results are what changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [activeLocations, roomQueries.map(q => q.data).join('|'), roomQueries.length]);

  // The venue's own zone once known; until then the browser's (a guessed country would pick the wrong "today").
  const timezone = activeLocations[0]?.timezone;
  const [selectedDay, setSelectedDay] = useState('');
  const day = selectedDay || localDay(new Date(), timezone);
  const week = weekStart(day);
  const days = Array.from({ length: 7 }, (_, index) => addDays(week, index));
  const [filters, setFilters] = useState<TimetableFilters>(NO_FILTERS);
  // Seven 48 px tabs do not fit at 320 px: the strip scrolls and keeps the selected day in view.
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tabsRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [day]);

  const sessions = useVenueWeek(open ? venueId : undefined, week);
  // The lessons say which courses they belong to: read exactly those (one cached document each), not the whole catalogue.
  const courseIds = useMemo(() => [...new Set((sessions.data ?? []).flatMap(s => s.courseId ? [s.courseId] : []))].sort(), [sessions.data]);
  const courses = useCoursesById(courseIds, open);
  const all = useMemo(() => weekLessons(sessions.data ?? [], courses.map, week), [sessions.data, courses.map, week]);
  const lessons = useMemo(() => filterLessons(all, filters), [all, filters]);
  const now = useNow(30000);
  const wide = useMediaQuery('(min-width: 1024px)');
  const dayLessons = lessons.filter(l => l.day === day);

  // Only what is on screen is quoted: the selected day on a phone, the filtered week on a desktop; upcoming lessons only,
  // one request per course (soonest first). Past lessons and lessons past the cap keep the regular price.
  const targetKey = useMemo(() => {
    const byCourse = new Map<string, string[]>();
    for (const { session, course } of wide ? lessons : dayLessons) {
      if (session.startsAt.toMillis() <= now) continue;
      byCourse.set(course.id, [...(byCourse.get(course.id) ?? []), session.id]);
    }
    return JSON.stringify([...byCourse].slice(0, MAX_QUOTED_COURSES));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wide, lessons, day, now]);
  // Paging through weeks quotes only the week you stop on.
  const settledKey = useDebouncedValue(targetKey, QUOTE_SETTLE_MS);
  const quoted = useMemo(() => JSON.parse(settledKey) as [string, string[]][], [settledKey]);
  const quotes = useQueries({ queries: quoted.map(([courseId, ids]) => ({
    queryKey: ['courses', 'quote', 'timetable', uid, courseId, ids.join(',')], enabled: !!uid,
    queryFn: () => quoteCourse(courseId, ids, false), staleTime: 10 * 60000, gcTime: 30 * 60000,
    refetchOnWindowFocus: false, retry: false })) });
  const quoteOf = useMemo(() => {
    const map = new Map<string, SessionQuote>();
    // Lesson ids are dates, shared by every course: the key carries the course too.
    quotes.forEach((q, i) => q.data?.sessions.forEach(s => map.set(`${quoted[i][0]}_${s.sessionId}`, s)));
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoted, quotes.map(q => q.dataUpdatedAt).join('|')]);

  const roomName = (lesson: TimetableLesson) => rooms.find(r => r.id === lesson.session.roomId)?.name || lesson.course.location;
  const card = (lesson: TimetableLesson) => <TimetableCard key={`${lesson.course.id}_${lesson.session.id}`} lesson={lesson}
    roomName={roomName(lesson)} quote={quoteOf.get(`${lesson.course.id}_${lesson.session.id}`)} now={now} />;

  const instructors = useMemo(() => {
    const map = new Map<string, string>();
    for (const { session } of all) map.set(instructorKey(session), instructorLabel(session));
    return [...map].filter(([, label]) => label).sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);
  const roomOptions = rooms.filter(r => !filters.locationId || r.locationId === filters.locationId);
  const times = [...new Set(lessons.map(l => l.time))].sort();
  const timeLabel = (time: string) => { const first = lessons.find(l => l.time === time); return first ? lessonTime(first, locale) : time; };

  if (!venueId) return <div className="p-6"><Link className="underline" href="/fit/gyms">{t('gym.selectGym')}</Link></div>;
  const weekText = t('timetable.week', { date: dayLabel(week, locale, { day: 'numeric', month: 'long' }) });
  const loading = venue.isLoading || (open && (sessions.isLoading || courses.isLoading));
  return <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 pb-28 md:px-8">
    <header className="space-y-2">
      <Link href={`/venue?id=${encodeURIComponent(venueId)}`} className="inline-flex min-h-11 items-center text-sm text-section-ink">← {venue.data?.name}</Link>
      <h1 className="font-display text-3xl font-bold text-content">{t('timetable.title')}</h1>
      {canManage && <Link href={`/provider/courses?venue=${encodeURIComponent(venueId)}`}
        className="inline-flex min-h-11 items-center rounded-xl border border-hairline px-4 text-sm font-semibold text-content">{t('timetable.manage')}</Link>}
    </header>
    {venue.data && !open ? <p className="rounded-xl border border-hairline bg-surface p-5 text-content">{t('timetable.suspended')}</p> : <>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-sm text-content">{t('gym.chooseLocation')}
          <select className={select} value={filters.locationId} onChange={e => setFilters({ ...filters, locationId: e.target.value, roomId: '' })}>
            <option value="">{t('timetable.allLocations')}</option>
            {activeLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className="space-y-1 text-sm text-content">{t('gym.chooseRoom')}
          <select className={select} value={filters.roomId} onChange={e => setFilters({ ...filters, roomId: e.target.value })}>
            <option value="">{t('timetable.allRooms')}</option>
            {roomOptions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label className="space-y-1 text-sm text-content">{t('courses.instructor')}
          <select className={select} value={filters.instructorKey} onChange={e => setFilters({ ...filters, instructorKey: e.target.value })}>
            <option value="">{t('timetable.allInstructors')}</option>
            {instructors.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      </div>
      <div className="flex items-center justify-between gap-3">
        <button type="button" className="grid size-11 shrink-0 place-items-center rounded-xl border border-hairline text-content" aria-label={t('timetable.previous')}
          onClick={() => setSelectedDay(addDays(day, -7))}><ChevronLeft size={20} /></button>
        <h2 className="text-center text-lg font-semibold text-content">{weekText}</h2>
        <button type="button" className="grid size-11 shrink-0 place-items-center rounded-xl border border-hairline text-content" aria-label={t('timetable.next')}
          onClick={() => setSelectedDay(addDays(day, 7))}><ChevronRight size={20} /></button>
      </div>
      {loading && <p className="text-content">{t('common.loading')}</p>}
      {(sessions.isError || courses.isError) && <p role="alert" className="text-error">{t('courses.loadError')}</p>}
      {!loading && !sessions.isError && !courses.isError && lessons.length === 0 &&
        <p className="text-content-muted" data-testid="timetable-empty">{t('timetable.empty')}</p>}
      {/* Phone: one day at a time. */}
      <section className="space-y-3 lg:hidden" aria-label={weekText} data-testid="day-list">
        <div ref={tabsRef} className="flex gap-1 overflow-x-auto pb-1" data-testid="day-tabs">{days.map(value => <button key={value} type="button" data-testid={`tab-${value}`}
          aria-pressed={value === day} onClick={() => setSelectedDay(value)}
          className={cn('min-h-14 min-w-12 flex-1 shrink-0 rounded-xl border p-1 text-center text-xs', value === day ?
            'border-section-primary bg-section-primary/15 text-section-ink' : 'border-hairline bg-surface text-content')}>
          <span className="block capitalize">{dayLabel(value, locale, { weekday: 'short' })}</span>
          <span className="block text-lg font-semibold">{dayLabel(value, locale, { day: 'numeric' })}</span>
        </button>)}</div>
        {!loading && lessons.length > 0 && dayLessons.length === 0 && <p className="text-content-muted">{t('timetable.empty')}</p>}
        <div className="space-y-3">{dayLessons.map(card)}</div>
      </section>
      {/* Desktop: Monday to Sunday, one row per start time. */}
      <section className="hidden lg:block" aria-label={weekText} data-testid="week-grid">
        <div className="grid gap-2" style={{ gridTemplateColumns: '4rem repeat(7, minmax(0, 1fr))' }}>
          <div />
          {days.map(value => <div key={value} className={cn('rounded-xl border p-2 text-center text-sm', value === day ?
            'border-section-primary text-section-ink' : 'border-hairline text-content')}>
            <span className="block capitalize">{dayLabel(value, locale, { weekday: 'short' })}</span>
            <span className="block text-lg font-semibold">{dayLabel(value, locale, { day: 'numeric' })}</span></div>)}
          {times.map(time => <Fragment key={time}>
            <div className="pt-3 text-sm font-semibold text-content-muted">{timeLabel(time)}</div>
            {days.map(value => <div key={value} data-day={value} data-time={time} className="min-w-0 space-y-2">
              {lessons.filter(l => l.day === value && l.time === time).map(card)}</div>)}
          </Fragment>)}
        </div>
      </section>
    </>}
  </div>;
}

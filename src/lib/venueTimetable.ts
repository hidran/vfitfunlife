import { addDays, localDay, sessionTime } from '@/lib/gymTime';
import type { Course, CourseSession } from '@/types/course';

/** A listed lesson placed on a local day of the venue's week. */
export interface TimetableLesson {
  session: CourseSession;
  course: Course;
  /** `YYYY-MM-DD` in the lesson's own (course) time zone. */
  day: string;
  /** `HH:mm` (24 h) in the same zone: the key lessons are grouped and sorted by. Show it with `lessonTime`. */
  time: string;
}

export interface TimetableFilters { locationId: string; roomId: string; instructorKey: string }

export const NO_FILTERS: TimetableFilters = { locationId: '', roomId: '', instructorKey: '' };

/** Number of distinct room accents; the room name is always printed too, so colour is never the only cue. */
export const ROOM_TONES = 6;

/** Stable accent index for a room id. */
export function roomTone(roomId: string | null | undefined): number {
  let hash = 0;
  for (const char of roomId ?? '') hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % ROOM_TONES;
}

/** Filter key of a lesson's instructor: the linked id, or the typed name for a free-text instructor. */
export function instructorKey(session: CourseSession): string {
  return session.instructorId ?? `name:${session.instructorName ?? session.instructor ?? ''}`;
}

export function instructorLabel(session: CourseSession): string {
  return session.instructorName || session.instructor || '';
}

/** Grouping key of a start time: `HH:mm`, 24 h, locale independent so equal times always share a row. */
function localTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone })
    .format(date);
}

/** A lesson's start time as the viewer's locale writes it (the one formatter the cards use as well). */
export function lessonTime({ session, course }: Pick<TimetableLesson, 'session' | 'course'>, locale: string): string {
  return sessionTime(session.startsAt.toDate(), locale, course.timezone);
}

/**
 * The listed, scheduled lessons whose local day (in the course's time zone) falls in the seven days from `week`
 * (a Monday). The query pads the UTC range by a day on each side, so the exact week is decided here. Lessons of a
 * course that is not in `courses` are dropped: there is nothing to link them to.
 */
export function weekLessons(sessions: CourseSession[], courses: Map<string, Course>, week: string): TimetableLesson[] {
  const days = new Set(Array.from({ length: 7 }, (_, index) => addDays(week, index)));
  const lessons: TimetableLesson[] = [];
  for (const session of sessions) {
    const course = session.courseId ? courses.get(session.courseId) : undefined;
    if (!course || session.state !== 'scheduled') continue;
    const startsAt = session.startsAt.toDate();
    const day = localDay(startsAt, course.timezone);
    if (days.has(day)) lessons.push({ session, course, day, time: localTime(startsAt, course.timezone) });
  }
  return lessons.sort((a, b) => a.session.startsAt.toMillis() - b.session.startsAt.toMillis());
}

export function filterLessons(lessons: TimetableLesson[], filters: TimetableFilters): TimetableLesson[] {
  return lessons.filter(({ session }) =>
    (!filters.locationId || session.locationId === filters.locationId) &&
    (!filters.roomId || session.roomId === filters.roomId) &&
    (!filters.instructorKey || instructorKey(session) === filters.instructorKey));
}

export type SeatState = { kind: 'seats'; left: number } | { kind: 'waitlist' } | { kind: 'full' };

/** Seats left, or why a full lesson is full: the waitlist is open only outside the booking notice window. */
export function seatState({ session, course }: Pick<TimetableLesson, 'session' | 'course'>, now: number): SeatState {
  const left = Math.max(0, (session.capacity ?? course.capacity) - session.occupied - session.held);
  if (left > 0) return { kind: 'seats', left };
  const open = course.waitlistEnabled !== false && course.state === 'published' && !course.enrollmentClosed &&
    session.startsAt.toMillis() > now + course.bookingNoticeHours * 3600000;
  return open ? { kind: 'waitlist' } : { kind: 'full' };
}

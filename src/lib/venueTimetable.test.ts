import { describe, expect, it } from 'vitest';
import { filterLessons, instructorKey, NO_FILTERS, roomTone, ROOM_TONES, seatState, weekLessons } from './venueTimetable';
import type { Timestamp } from 'firebase/firestore';
import type { Course, CourseSession } from '@/types/course';

const ts = (iso: string) => ({ toMillis: () => new Date(iso).getTime(), toDate: () => new Date(iso) }) as unknown as Timestamp;
const course = (over: Partial<Course> = {}) => ({ id: 'c1', name: 'Yoga', timezone: 'Europe/Rome', capacity: 2,
  bookingNoticeHours: 2, state: 'published', enrollmentClosed: false, waitlistEnabled: true, ...over }) as Course;
const lesson = (id: string, iso: string, over: Partial<CourseSession> = {}) => ({ id, courseId: 'c1', state: 'scheduled',
  startsAt: ts(iso), endsAt: ts(iso), capacity: 2, occupied: 0, held: 0, listed: true, roomId: 'r1', locationId: 'l1', ...over }) as CourseSession;
const courses = new Map([['c1', course()]]);

describe('weekLessons', () => {
  it('puts Monday and Sunday lessons on their local days', () => {
    const result = weekLessons([lesson('mon', '2026-10-12T17:00:00Z'), lesson('sun', '2026-10-18T08:00:00Z')], courses, '2026-10-12');
    expect(result.map(l => [l.session.id, l.day, l.time])).toEqual([['mon', '2026-10-12', '19:00'], ['sun', '2026-10-18', '10:00']]);
  });

  it('decides the day in the course zone across the DST change week (Rome leaves summer time on 2026-10-25)', () => {
    const sessions = [
      // Sunday 2026-10-25 23:30 Rome (UTC+1 after the change) is still Sunday there, 22:30Z.
      lesson('sunLate', '2026-10-25T22:30:00Z'),
      // 00:30 Monday 2026-10-26 Rome is 23:30Z Sunday: it must NOT count as Sunday.
      lesson('monEarly', '2026-10-25T23:30:00Z'),
      // 02:30 on the 25th happens twice; this is the second (UTC+1) one.
      lesson('ambiguous', '2026-10-25T01:30:00Z'),
    ];
    const week = weekLessons(sessions, courses, '2026-10-19');
    expect(week.map(l => [l.session.id, l.day, l.time])).toEqual([
      ['ambiguous', '2026-10-25', '02:30'], ['sunLate', '2026-10-25', '23:30']]);
    expect(weekLessons(sessions, courses, '2026-10-26').map(l => [l.session.id, l.day, l.time])).toEqual([['monEarly', '2026-10-26', '00:30']]);
  });

  it('drops cancelled lessons and lessons of unknown courses', () => {
    const result = weekLessons([lesson('a', '2026-10-13T17:00:00Z', { state: 'cancelled' }),
      lesson('b', '2026-10-13T17:00:00Z', { courseId: 'other' }), lesson('c', '2026-10-13T17:00:00Z')], courses, '2026-10-12');
    expect(result.map(l => l.session.id)).toEqual(['c']);
  });
});

describe('filterLessons', () => {
  const lessons = weekLessons([
    lesson('a', '2026-10-13T17:00:00Z', { roomId: 'r1', locationId: 'l1', instructorId: 'i1', instructorName: 'Anna' }),
    lesson('b', '2026-10-13T18:00:00Z', { roomId: 'r2', locationId: 'l1', instructorId: null, instructorName: 'Guest' }),
    lesson('c', '2026-10-13T19:00:00Z', { roomId: 'r3', locationId: 'l2', instructorId: 'i1', instructorName: 'Anna' }),
  ], courses, '2026-10-12');

  it('narrows by location, room and instructor', () => {
    expect(filterLessons(lessons, NO_FILTERS)).toHaveLength(3);
    expect(filterLessons(lessons, { ...NO_FILTERS, locationId: 'l1' }).map(l => l.session.id)).toEqual(['a', 'b']);
    expect(filterLessons(lessons, { ...NO_FILTERS, roomId: 'r3' }).map(l => l.session.id)).toEqual(['c']);
    expect(filterLessons(lessons, { ...NO_FILTERS, instructorKey: 'i1' }).map(l => l.session.id)).toEqual(['a', 'c']);
    expect(filterLessons(lessons, { ...NO_FILTERS, instructorKey: instructorKey(lessons[1].session) }).map(l => l.session.id)).toEqual(['b']);
  });
});

describe('seatState', () => {
  const now = new Date('2026-10-13T00:00:00Z').getTime();
  const state = (over: Partial<CourseSession>, c: Partial<Course> = {}) =>
    seatState({ session: lesson('s', '2026-10-14T10:00:00Z', over), course: course(c) }, now);

  it('counts seats, treating held seats as taken', () => {
    expect(state({ occupied: 1, held: 0 })).toEqual({ kind: 'seats', left: 1 });
    expect(state({ occupied: 1, held: 1 })).toEqual({ kind: 'waitlist' });
  });
  it('is full when the waitlist is off or the notice window has closed', () => {
    expect(state({ occupied: 2 }, { waitlistEnabled: false })).toEqual({ kind: 'full' });
    expect(state({ occupied: 2, startsAt: ts('2026-10-13T01:00:00Z') })).toEqual({ kind: 'full' });
  });
});

describe('roomTone', () => {
  it('is stable and within the palette', () => {
    expect(roomTone('room-a')).toBe(roomTone('room-a'));
    expect(roomTone('room-a')).toBeLessThan(ROOM_TONES);
    expect(roomTone(null)).toBe(0);
  });
});

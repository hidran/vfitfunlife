import { describe, expect, it } from 'vitest';
import { initialLessonMonth, LESSON_PAGE_SIZE, lessonMonthKey, lessonMonthLabel, lessonMonths, paginate } from './lessonPaging';

const at = (iso: string) => ({ toDate: () => new Date(iso), toMillis: () => Date.parse(iso) }) as never;

describe('lesson months', () => {
  it('reads the month in the course time zone, not UTC', () => {
    expect(lessonMonthKey(at('2026-12-31T23:30:00Z'), 'Europe/Rome')).toBe('2027-01');
    expect(lessonMonthKey(at('2026-12-31T23:30:00Z'), 'UTC')).toBe('2026-12');
  });

  it('names a month in the customer language without drifting to a neighbour month', () => {
    expect(lessonMonthLabel('2027-03', 'en')).toBe('March 2027');
    expect(lessonMonthLabel('2027-03', 'it')).toBe('marzo 2027');
    expect(lessonMonthLabel('not-a-month', 'en')).toBe('not-a-month');
  });

  it('lists the distinct months oldest first, with their lesson counts', () => {
    const lessons = [at('2026-11-02T18:00:00Z'), at('2026-10-05T18:00:00Z'), at('2026-11-09T18:00:00Z')]
      .map((startsAt, index) => ({ id: `s${index}`, startsAt }));
    expect(lessonMonths(lessons, 'Europe/Rome')).toEqual([{ key: '2026-10', count: 1 }, { key: '2026-11', count: 2 }]);
  });

  it('opens on the linked lesson, then on the next lesson ahead, then on the last one', () => {
    const lessons = [
      { id: 'past', startsAt: at('2026-01-10T18:00:00Z') },
      { id: 'next', startsAt: at('2026-06-10T18:00:00Z') },
      { id: 'later', startsAt: at('2026-09-10T18:00:00Z') },
    ];
    const now = Date.parse('2026-05-01T00:00:00Z');
    expect(initialLessonMonth(lessons, 'Europe/Rome', now, 'later')).toBe('2026-09');
    expect(initialLessonMonth(lessons, 'Europe/Rome', now)).toBe('2026-06');
    expect(initialLessonMonth(lessons, 'Europe/Rome', Date.parse('2027-01-01T00:00:00Z'))).toBe('2026-09');
    expect(initialLessonMonth([], 'Europe/Rome', now)).toBe('');
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, index) => index + 1);

  it('slices one page and reports where it sits in the list', () => {
    expect(paginate(items, 1)).toMatchObject({ items: items.slice(0, LESSON_PAGE_SIZE), page: 1, pages: 3, from: 1, to: 10, total: 25 });
    expect(paginate(items, 3)).toMatchObject({ items: [21, 22, 23, 24, 25], page: 3, pages: 3, from: 21, to: 25 });
  });

  it('clamps a page beyond the end, so filtering down never shows an empty list', () => {
    expect(paginate(items, 99).page).toBe(3);
    expect(paginate(items, 0).page).toBe(1);
    expect(paginate([], 4)).toEqual({ items: [], page: 1, pages: 1, from: 0, to: 0, total: 0 });
  });
});

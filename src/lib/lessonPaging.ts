import type { Timestamp } from 'firebase/firestore';

/** Lessons shown at once in a course list or in one booking card. */
export const LESSON_PAGE_SIZE = 10;

/**
 * The `YYYY-MM` month of an instant in the course's own time zone. A course can run for a year, so its lessons are
 * read month by month; picking the month in the venue's zone (never the browser's) keeps a late-evening lesson in the
 * month the customer sees on its date.
 */
export function lessonMonthKey(at: Timestamp, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', timeZone }).formatToParts(at.toDate());
  const year = parts.find(part => part.type === 'year')?.value ?? '';
  const month = parts.find(part => part.type === 'month')?.value ?? '';
  return `${year}-${month}`;
}

/** The month as the customer reads it, e.g. "March 2027" in their language. An unknown key is shown as is. */
export function lessonMonthLabel(key: string, locale: string): string {
  const [year, month] = key.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !year || !month) return key;
  // Midday on the 15th: no time zone can push this instant into a neighbouring month.
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(year, month - 1, 15, 12)));
}

export interface LessonMonth { key: string; count: number }

/** The distinct months of `lessons`, oldest first, with how many lessons each holds. */
export function lessonMonths<T extends { startsAt: Timestamp }>(lessons: T[], timeZone: string): LessonMonth[] {
  const counts = new Map<string, number>();
  for (const lesson of lessons) {
    const key = lessonMonthKey(lesson.startsAt, timeZone);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => ({ key, count }));
}

export interface Page<T> { items: T[]; page: number; pages: number; from: number; to: number; total: number }

/** One 1-based page of `items`. An out-of-range page is clamped, so a month change never leaves an empty list. */
export function paginate<T>(items: T[], page: number, size = LESSON_PAGE_SIZE): Page<T> {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (current - 1) * size;
  const items_ = items.slice(start, start + size);
  return { items: items_, page: current, pages, from: items.length ? start + 1 : 0, to: start + items_.length, total: items.length };
}

/**
 * The month to open on: the linked lesson's when the page was opened from a timetable or a notification, otherwise
 * the first lesson still ahead, otherwise the last one. Empty when there is nothing to show.
 */
export function initialLessonMonth<T extends { id: string; startsAt: Timestamp }>(
  lessons: T[], timeZone: string, now: number, linkedId?: string,
): string {
  const linked = linkedId ? lessons.find(lesson => lesson.id === linkedId) : undefined;
  if (linked) return lessonMonthKey(linked.startsAt, timeZone);
  const byStart = [...lessons].sort((a, b) => a.startsAt.toMillis() - b.startsAt.toMillis());
  const pick = byStart.find(lesson => lesson.startsAt.toMillis() > now) ?? byStart[byStart.length - 1];
  return pick ? lessonMonthKey(pick.startsAt, timeZone) : '';
}

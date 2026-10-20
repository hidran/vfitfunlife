import { useMemo, useState } from 'react';
import type { Timestamp } from 'firebase/firestore';
import {
  initialLessonMonth, lessonMonthKey, lessonMonths, paginate, type LessonMonth, type Page,
} from '@/lib/lessonPaging';

export interface LessonWindow<T> {
  /** Months of the filtering lessons, oldest first; fewer than two means there is nothing to filter. */
  months: LessonMonth[];
  /** The selected month (`YYYY-MM`), `''` for all months. */
  month: string;
  setMonth: (month: string) => void;
  /** The lessons of the selected month, in their schedule order. */
  visible: T[];
  page: Page<T>;
  setPage: (page: number) => void;
  /** False when no time zone is known (older bookings), so the month names would be guesses. */
  canFilterByMonth: boolean;
}

/**
 * Month filtering and paging over a course's lessons. A yearly course can have hundreds of lessons, so both the public
 * course page and the customer's booking card open on the month that matters now (or on the lesson a link named) and
 * show one page at a time; the choice is local to the screen, not part of the address.
 */
export function useLessonWindow<T extends { id: string; startsAt: Timestamp }>(
  lessons: T[], timeZone: string | undefined, now: number, linkedId?: string,
): LessonWindow<T> {
  const zone = timeZone || 'UTC';
  const months = useMemo(() => lessonMonths(lessons, zone), [lessons, zone]);
  const initial = useMemo(() => initialLessonMonth(lessons, zone, now, linkedId), [lessons, zone, now, linkedId]);
  // `null` follows the opening month until the customer picks one (including "All months", which is `''`).
  const [chosen, setChosen] = useState<string | null>(null);
  const [requestedPage, setRequestedPage] = useState(1);
  const canFilterByMonth = !!timeZone;
  // Without a known zone the month names would be guesses, so the whole list is shown unpaged by month.
  const month = canFilterByMonth ? chosen ?? initial : '';
  const visible = useMemo(() => month ? lessons.filter(lesson => lessonMonthKey(lesson.startsAt, zone) === month) : lessons,
    [lessons, month, zone]);
  const page = useMemo(() => paginate(visible, requestedPage), [visible, requestedPage]);
  function setMonth(next: string) {
    setChosen(next);
    setRequestedPage(1);
  }
  return { months, month, setMonth, visible, page, setPage: setRequestedPage, canFilterByMonth };
}

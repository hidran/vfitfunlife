import { localDateKey } from './dates';

/**
 * Which days of a booking calendar month can actually be booked.
 *
 * There is deliberately no rule engine here: whether a day has a free start depends on the
 * weekly hours, that date's override, the minimum notice and the provider's other bookings,
 * and only getProviderSlots (functions/src/availability/slots.ts) sees all of those. So each
 * candidate day is simply asked the same question the slot list asks, and a day counts as
 * bookable when that answer holds at least one time.
 */

/** A day's state in the picker. `unknown` = not asked yet, or the question failed. */
export type DayAvailability = 'bookable' | 'unavailable' | 'unknown';

/** date key ("YYYY-MM-DD") → whether that day has ≥1 free start. Days that could not be checked are absent. */
export type BookableDays = Record<string, boolean>;

/**
 * The days of `month` worth asking about: local-midnight picker cells from today (in the
 * device's calendar, like the picker's own cells) to the end of the month, capped at `maxDate`.
 * A month entirely in the past yields none.
 */
export function daysToCheck(month: Date, now: Date, maxDate?: Date): Date[] {
  const year = month.getFullYear();
  const m = month.getMonth();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const last = new Date(year, m + 1, 0).getDate();
  const out: Date[] = [];
  for (let d = 1; d <= last; d++) {
    const date = new Date(year, m, d);
    if (date < today) continue;
    if (maxDate && date > maxDate) break;
    out.push(date);
  }
  return out;
}

/**
 * Asks `countSlots` about every day, at most `concurrency` at a time (a month is ~30 calls),
 * and records which have ≥1 slot. A day whose question fails is left out rather than marked
 * unavailable: an error is not proof the day is full, and the slot list will show the real
 * reason when the day is picked.
 */
export async function findBookableDays(
  days: Date[],
  countSlots: (day: Date) => Promise<number>,
  concurrency = 6,
): Promise<BookableDays> {
  const result: BookableDays = {};
  let next = 0;
  const worker = async () => {
    while (next < days.length) {
      const day = days[next++];
      try {
        result[localDateKey(day)] = (await countSlots(day)) > 0;
      } catch {
        // unknown: see above
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, days.length)) }, worker));
  return result;
}

/** What the picker should make of one day, given the answers so far. */
export function dayAvailability(bookable: BookableDays | undefined, day: Date): DayAvailability {
  const answer = bookable?.[localDateKey(day)];
  return answer === undefined ? 'unknown' : answer ? 'bookable' : 'unavailable';
}

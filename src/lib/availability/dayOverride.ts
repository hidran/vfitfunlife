import type { TimeRange } from '@/types/provider';
import {
  toRules,
  type AvailabilityUpdate,
  type OverrideDoc,
  type StoredAvailability,
  type WeeklyWindow,
} from './adapter';

/**
 * One-date edits from /provider/schedule ("Imposta giorno libero", "Blocca orario").
 *
 * Both are date exceptions (instructors/{uid}/availability/{date}) — the only thing the slot
 * engine (functions/src/availability/slots.ts windowsFor) reads besides the weekly hours. A
 * blocked range is stored as "that day's bookable windows minus the range". Pure, so the
 * merge rules are unit-tested; the store sends the result through updateMyAvailability.
 */

/** Mirrors functions/src/availability/validate.ts MAX_WINDOWS_PER_DAY. */
export const MAX_WINDOWS_PER_DAY = 10;

/**
 * Statuses that hold the provider's time — the server's ACTIVE_BOOKING_STATUSES
 * (functions/src/availability/dayContext.ts). A day off or blocked range does NOT cancel these.
 */
export const SLOT_HOLDING_STATUSES: readonly string[] = [
  'requested',
  'accepted',
  'payment_confirmed',
  'pending',
  'confirmed',
  'in_progress',
];

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** 0 = Sunday … 6 = Saturday for a "YYYY-MM-DD" key (calendar arithmetic, no timezone). */
export function dayOfWeekOfKey(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The weekday's regular bookable windows, sorted. */
export function regularWindowsFor(schedule: WeeklyWindow[], date: string): TimeRange[] {
  const dow = dayOfWeekOfKey(date);
  return schedule
    .filter((w) => w.dayOfWeek === dow && w.isAvailable !== false)
    .map((w) => ({ start: w.startTime, end: w.endTime }))
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}

/** `windows` with [from, to) cut out of them. */
export function subtractRange(windows: TimeRange[], from: string, to: string): TimeRange[] {
  const f = toMinutes(from);
  const t = toMinutes(to);
  const out: TimeRange[] = [];
  for (const w of windows) {
    const s = toMinutes(w.start);
    const e = toMinutes(w.end);
    if (t <= s || f >= e) {
      out.push({ ...w });
      continue;
    }
    if (f > s) out.push({ start: w.start, end: from });
    if (t < e) out.push({ start: to, end: w.end });
  }
  return out;
}

/** Closes the whole day, keeping a reason the existing exception already had. */
export function dayOffOverride(date: string, existing: OverrideDoc | null | undefined): OverrideDoc {
  const doc: OverrideDoc = { date, isAvailable: false, windows: [] };
  if (existing?.reason) doc.reason = existing.reason;
  return doc;
}

export type BlockRangeResult =
  | { ok: true; override: OverrideDoc }
  | { ok: false; reason: 'invalidRange' | 'dayOff' | 'nothingToBlock' | 'tooManyWindows' };

/**
 * The exception that blocks [from, to) on `date`. Starts from the date's existing exception
 * when there is one (so a second blocked range adds to the first instead of replacing it),
 * else from that weekday's regular hours. Blocking every remaining window closes the day.
 */
export function blockRangeOverride(input: {
  schedule: WeeklyWindow[];
  existing: OverrideDoc | null | undefined;
  date: string;
  from: string;
  to: string;
}): BlockRangeResult {
  const { schedule, existing, date, from, to } = input;
  if (toMinutes(from) >= toMinutes(to)) return { ok: false, reason: 'invalidRange' };
  if (existing && !existing.isAvailable) return { ok: false, reason: 'dayOff' };

  const base = existing ? existing.windows : regularWindowsFor(schedule, date);
  const windows = subtractRange(base, from, to);
  const unchanged = windows.length === base.length &&
    windows.every((w, i) => w.start === base[i].start && w.end === base[i].end);
  if (unchanged) return { ok: false, reason: 'nothingToBlock' };
  if (windows.length > MAX_WINDOWS_PER_DAY) return { ok: false, reason: 'tooManyWindows' };

  const override: OverrideDoc = windows.length > 0
    ? { date, isAvailable: true, windows }
    : { date, isAvailable: false, windows: [] };
  if (existing?.reason) override.reason = existing.reason;
  return { ok: true, override };
}

/**
 * updateMyAvailability's payload for a one-date change: the weekly hours and rules exactly as
 * stored (it always takes the whole schedule), and only this date's exception — every other
 * saved exception is left untouched, since the callable merges upserts per date.
 */
export function singleOverrideUpdate(stored: StoredAvailability, override: OverrideDoc): AvailabilityUpdate {
  return {
    schedule: stored.schedule ?? [],
    bookingRules: toRules(stored.bookingRules),
    overrides: { upsert: [override], delete: [] },
  };
}

export type BlockedInterval = { kind: 'dayOff' } | { kind: 'range'; start: string; end: string };

/**
 * What an exception takes away from the regular week, for the calendar: the whole day, or the
 * regular windows the exception no longer offers. An exception that only adds hours shows
 * nothing.
 */
export function blockedIntervals(schedule: WeeklyWindow[], override: OverrideDoc): BlockedInterval[] {
  if (!override.isAvailable) return [{ kind: 'dayOff' }];
  let remaining = regularWindowsFor(schedule, override.date);
  for (const w of override.windows) remaining = subtractRange(remaining, w.start, w.end);
  return remaining.map((r) => ({ kind: 'range' as const, start: r.start, end: r.end }));
}

/** Slot-holding bookings among `events` that overlap [from, to) on the local day `date`. */
export function overlappingActive<T extends { start: Date; end: Date; status?: string; type: string }>(
  events: T[],
  date: string,
  from = '00:00',
  to = '23:59',
): T[] {
  const [y, m, d] = date.split('-').map(Number);
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  const f = new Date(y, m - 1, d, fh, fm).getTime();
  const t = new Date(y, m - 1, d, th, tm).getTime();
  return events.filter((e) =>
    e.type === 'booking' &&
    SLOT_HOLDING_STATUSES.includes(e.status ?? '') &&
    new Date(e.start).getTime() < t &&
    new Date(e.end).getTime() > f,
  );
}

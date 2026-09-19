import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import type { AvailabilitySlot } from "../ai/search/match";

/** Every provider is in Italy: all availability is wall-clock time in this zone. */
export const ROME = "Europe/Rome";

export type WeeklyWindow = AvailabilitySlot;

export interface TimeWindow {
  start: string; // "HH:mm"
  end: string; // "HH:mm"
}

/** instructors/{id}/availability/{YYYY-MM-DD}. isAvailable false closes the day. */
export interface DateOverride {
  isAvailable: boolean;
  windows: TimeWindow[];
  reason?: string;
}

export interface BookingRules {
  bufferMinutes: number;
  minAdvanceNoticeHours: number;
  maxBookingsPerDay: number;
}

export const DEFAULT_BOOKING_RULES: BookingRules = {
  bufferMinutes: 15,
  minAdvanceNoticeHours: 24,
  maxBookingsPerDay: 8,
};

/**
 * Every provider starts bookable: Mon–Fri 09:00–17:00, one window per day. Written as real
 * data by provider approval and by the historical-schedule migration (not generated here at
 * read time), so a provider with no hours has deliberately switched every day off. This is
 * the single source of truth for that default; mirror it, don't recompute it, if another
 * layer ever needs the same shape.
 */
export const DEFAULT_WEEKLY_HOURS: WeeklyWindow[] = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startTime: "09:00",
  endTime: "17:00",
  isAvailable: true,
}));

export interface BusyInterval {
  start: Date;
  end: Date;
}

export interface SlotQuery {
  schedule: WeeklyWindow[];
  override: DateOverride | null;
  rules: BookingRules;
  /** The provider's active bookings that start on `date`. */
  busy: BusyInterval[];
  durationMinutes: number;
  date: string; // "YYYY-MM-DD", Europe/Rome
  now: Date;
  stepMinutes?: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

export function isTimeKey(value: unknown): value is string {
  return typeof value === "string" && TIME_RE.test(value);
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function fromMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** The instant a Rome wall-clock time happens. Nonexistent times (spring-forward gap) shift. */
export function romeInstant(date: string, time: string): Date {
  return fromZonedTime(`${date}T${time}:00`, ROME);
}

export function romeDateOf(instant: Date): string {
  return formatInTimeZone(instant, ROME, "yyyy-MM-dd");
}

export function romeTimeOf(instant: Date): string {
  return formatInTimeZone(instant, ROME, "HH:mm");
}

/** [start of `date`, start of the next day) in Rome, as instants. 23 or 25 hours on DST days. */
export function romeDayBounds(date: string): { start: Date; end: Date } {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return { start: romeInstant(date, "00:00"), end: romeInstant(next, "00:00") };
}

/** 0 = Sunday … 6 = Saturday, like WeeklyWindow.dayOfWeek. */
export function dayOfWeekOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The day's windows: the override's when there is one, else the weekly ones for that weekday. */
export function windowsFor(schedule: WeeklyWindow[], override: DateOverride | null, date: string): TimeWindow[] {
  if (override) return override.isAvailable ? override.windows : [];
  const dow = dayOfWeekOf(date);
  return schedule
    .filter((w) => w.dayOfWeek === dow && w.isAvailable !== false)
    .map((w) => ({ start: w.startTime, end: w.endTime }));
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Start times ("HH:mm", Rome) a new booking of `durationMinutes` can take on `date`.
 *
 * A start t qualifies iff: some window contains [t, t + duration]; t is at least
 * minAdvanceNoticeHours after `now`; [t − buffer, t + duration + buffer] overlaps no busy
 * interval; and the day holds fewer than maxBookingsPerDay active bookings.
 *
 * Candidates step from each window's start. Everything is compared as real instants, so a
 * DST day's missing or repeated hour is handled: a wall time that does not exist is skipped.
 */
export function freeSlots(q: SlotQuery): string[] {
  if (!(q.durationMinutes > 0)) return [];
  if (q.busy.length >= q.rules.maxBookingsPerDay) return [];

  const step = q.stepMinutes ?? 30;
  const durationMs = q.durationMinutes * 60_000;
  const bufferMs = q.rules.bufferMinutes * 60_000;
  const earliest = q.now.getTime() + q.rules.minAdvanceNoticeHours * 3_600_000;
  const busy = q.busy.map((b) => ({ start: b.start.getTime(), end: b.end.getTime() }));
  const out = new Set<string>();

  for (const w of windowsFor(q.schedule, q.override, q.date)) {
    const windowEnd = romeInstant(q.date, w.end).getTime();
    for (let m = toMinutes(w.start); m < toMinutes(w.end); m += step) {
      const time = fromMinutes(m);
      const start = romeInstant(q.date, time);
      if (romeTimeOf(start) !== time) continue; // skipped by the spring-forward gap
      const s = start.getTime();
      const e = s + durationMs;
      if (e > windowEnd) break;
      if (s < earliest) continue;
      if (busy.some((b) => overlaps(s - bufferMs, e + bufferMs, b.start, b.end))) continue;
      out.add(time);
    }
  }
  return [...out].sort();
}

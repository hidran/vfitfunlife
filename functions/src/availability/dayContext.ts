import { normalizeAvailability } from "../ai/search/normalize";
import type { LegacyBookingStatus } from "../bookings/types";
import {
  DEFAULT_BOOKING_RULES,
  isTimeKey,
  romeDateOf,
  toMinutes,
  type BookingRules,
  type BusyInterval,
  type DateOverride,
  type SlotQuery,
  type TimeWindow,
  type WeeklyWindow,
} from "./slots";

/**
 * Legacy pre-migration statuses that still mean "holds its time" (BOOKING_STATUSES replaced
 * these; see LegacyBookingStatus). A safety net for documents the status backfill may have
 * missed — without this, such a booking would not block its slot and could be double-booked.
 */
export const LEGACY_ACTIVE_BOOKING_STATUSES: readonly LegacyBookingStatus[] = ["pending", "confirmed", "in_progress"];

/**
 * A booking in one of these holds its time. Every other status frees it. Shared by
 * getProviderSlots and createBooking (both read through dayContextFrom below) so the two can
 * never disagree about which bookings are active.
 */
export const ACTIVE_BOOKING_STATUSES: readonly string[] = [
  "requested",
  "accepted",
  "payment_confirmed",
  ...LEGACY_ACTIVE_BOOKING_STATUSES,
];

type Doc = Record<string, unknown>;
type TimestampLike = { toDate: () => Date };

/** The raw documents one provider-day needs. Each booking carries its `id` (see readDayDocs). */
export interface DayDocs {
  instructor: Doc | undefined;
  override: Doc | undefined;
  bookings: Doc[];
}

/**
 * Whether this is the booking being moved. A reschedule has to ignore the booking's own
 * current time, or it would block the very slot it is trying to leave and count twice against
 * maxBookingsPerDay — a session could then never move within the day it already occupies.
 */
function isExcluded(b: Doc, excludeBookingId: string | undefined): boolean {
  return excludeBookingId !== undefined && b.id === excludeBookingId;
}

function isTimestampLike(v: unknown): v is TimestampLike {
  return typeof v === "object" && v !== null && typeof (v as TimestampLike).toDate === "function";
}

function intIn(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : fallback;
}

/** bookingRules with defaults for anything absent or out of range. */
export function resolveRules(raw: unknown): BookingRules {
  const r = (raw ?? {}) as Doc;
  return {
    bufferMinutes: intIn(r.bufferMinutes, 0, 120, DEFAULT_BOOKING_RULES.bufferMinutes),
    minAdvanceNoticeHours: intIn(r.minAdvanceNoticeHours, 0, 168, DEFAULT_BOOKING_RULES.minAdvanceNoticeHours),
    maxBookingsPerDay: intIn(r.maxBookingsPerDay, 1, 50, DEFAULT_BOOKING_RULES.maxBookingsPerDay),
  };
}

/**
 * The provider's weekly hours, validated the same way an override's windows are: only
 * well-formed "HH:mm" on both ends, with start before end, survive. `functions/src/users/
 * roles.ts` still stores whatever schedule a client supplies for a role change, so this is
 * reachable with malformed data. Without it, a bad `startTime` (`toMinutes` is NaN, and NaN
 * compared to anything is always false) silently empties the whole day in `freeSlots`, and a
 * non-canonical `endTime` like "18:00:00" makes `romeInstant` build an invalid instant, so the
 * "session must fit before the window ends" check never fires and a session can be offered
 * past the window.
 */
export function parseSchedule(raw: unknown): WeeklyWindow[] {
  return normalizeAvailability(raw).filter((w) =>
    w.dayOfWeek >= 0 && w.dayOfWeek <= 6 &&
    isTimeKey(w.startTime) && isTimeKey(w.endTime) &&
    toMinutes(w.startTime) < toMinutes(w.endTime));
}

/** An override doc, or null when there is none (or it is not in the current shape). */
export function parseOverride(raw: Doc | undefined): DateOverride | null {
  if (!raw || typeof raw.isAvailable !== "boolean") return null;
  const windows = Array.isArray(raw.windows) ?
    (raw.windows as Doc[])
      .filter((w) => isTimeKey(w?.start) && isTimeKey(w?.end) && (w.start as string) < (w.end as string))
      .map((w): TimeWindow => ({ start: w.start as string, end: w.end as string })) :
    [];
  return { isAvailable: raw.isAvailable, windows };
}

function isActiveBooking(b: Doc): boolean {
  return typeof b.status === "string" && ACTIVE_BOOKING_STATUSES.includes(b.status);
}

/** A booking with no usable length still occupies an hour rather than nothing. */
export const DEFAULT_BOOKING_DURATION_MINUTES = 60;

/**
 * How long a booking runs. One resolver for the whole system: what the slot engine treats as
 * a booking's footprint and what rescheduleBooking writes back must never disagree, or a
 * session validated as an hour ends up sitting on top of a 90-minute one. Numeric strings are
 * coerced because older documents store them that way; 0, a negative and NaN fall back rather
 * than producing an interval that ends before it starts.
 */
export function bookingDurationMinutes(booking: { durationMinutes?: unknown; duration?: unknown }): number {
  const minutes = Number(booking.durationMinutes ?? booking.duration);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_BOOKING_DURATION_MINUTES;
}

/**
 * Active bookings as busy intervals, for the buffer/overlap check. A missing end falls back
 * to start + duration. `bookings` may span more than `date` itself (dayReads reads from 24h
 * before the day begins) — a booking from the previous day that runs past midnight still
 * blocks a slot here even though it does not count toward `date`'s own cap (bookingsStartingOn).
 */
export function busyFrom(bookings: Doc[], excludeBookingId?: string): BusyInterval[] {
  const out: BusyInterval[] = [];
  for (const b of bookings) {
    if (isExcluded(b, excludeBookingId)) continue;
    if (!isActiveBooking(b)) continue;
    if (!isTimestampLike(b.scheduledAt)) continue;
    const start = b.scheduledAt.toDate();
    const end = isTimestampLike(b.scheduledEndAt) ?
      b.scheduledEndAt.toDate() :
      new Date(start.getTime() + bookingDurationMinutes(b) * 60_000);
    out.push({ start, end });
  }
  return out;
}

/**
 * How many active bookings actually START on `date` (Rome calendar day) — the
 * maxBookingsPerDay cap. Distinct from `busyFrom(bookings).length`: a booking that spilled
 * over from the previous day is busy (it blocks a slot) but was not one of today's bookings.
 */
export function bookingsStartingOn(bookings: Doc[], date: string, excludeBookingId?: string): number {
  let n = 0;
  for (const b of bookings) {
    if (isExcluded(b, excludeBookingId)) continue;
    if (isActiveBooking(b) && isTimestampLike(b.scheduledAt) && romeDateOf(b.scheduledAt.toDate()) === date) n++;
  }
  return n;
}

/**
 * Everything freeSlots needs except the duration and the clock. `excludeBookingId` leaves one
 * booking out of both `busy` and the day's count — what rescheduleBooking, and the slot picker
 * in front of it, need so a session can be moved within the day it already occupies.
 */
export function dayContextFrom(
  docs: DayDocs,
  date: string,
  excludeBookingId?: string,
): Pick<SlotQuery, "schedule" | "override" | "rules" | "busy" | "bookingsToday"> {
  return {
    schedule: parseSchedule(docs.instructor?.availabilitySchedule),
    override: parseOverride(docs.override),
    rules: resolveRules(docs.instructor?.bookingRules),
    busy: busyFrom(docs.bookings, excludeBookingId),
    bookingsToday: bookingsStartingOn(docs.bookings, date, excludeBookingId),
  };
}

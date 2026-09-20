import { normalizeAvailability } from "../ai/search/normalize";
import type { LegacyBookingStatus } from "../bookings/types";
import {
  DEFAULT_BOOKING_RULES,
  isTimeKey,
  type BookingRules,
  type BusyInterval,
  type DateOverride,
  type SlotQuery,
  type TimeWindow,
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

/** The raw documents one provider-day needs. */
export interface DayDocs {
  instructor: Doc | undefined;
  override: Doc | undefined;
  bookings: Doc[];
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

/** Active bookings as busy intervals. A missing end falls back to start + duration. */
export function busyFrom(bookings: Doc[]): BusyInterval[] {
  const out: BusyInterval[] = [];
  for (const b of bookings) {
    if (typeof b.status !== "string" || !ACTIVE_BOOKING_STATUSES.includes(b.status)) continue;
    if (!isTimestampLike(b.scheduledAt)) continue;
    const start = b.scheduledAt.toDate();
    const minutes = Number(b.durationMinutes ?? b.duration ?? 60) || 60;
    const end = isTimestampLike(b.scheduledEndAt) ?
      b.scheduledEndAt.toDate() :
      new Date(start.getTime() + minutes * 60_000);
    out.push({ start, end });
  }
  return out;
}

/** Everything freeSlots needs except the duration, the date and the clock. */
export function dayContextFrom(docs: DayDocs): Pick<SlotQuery, "schedule" | "override" | "rules" | "busy"> {
  return {
    schedule: normalizeAvailability(docs.instructor?.availabilitySchedule),
    override: parseOverride(docs.override),
    rules: resolveRules(docs.instructor?.bookingRules),
    busy: busyFrom(docs.bookings),
  };
}

import { HttpsError } from "firebase-functions/v2/https";
import {
  isDateKey,
  isTimeKey,
  romeInstant,
  toMinutes,
  type BookingRules,
  type DateOverride,
  type TimeWindow,
  type WeeklyWindow,
} from "./slots";

export const MAX_WINDOWS_PER_DAY = 10;
/** One batch: the instructor doc plus every override write must stay under Firestore's 500. */
export const MAX_OVERRIDE_WRITES = 400;
const MAX_REASON = 200;
/** Generous headroom over 7 entries/day * 10 windows/day; a bigger payload risks the 1 MiB
 * document limit and is certainly not a real schedule. */
export const MAX_SCHEDULE_ENTRIES = 70;
/** getProviderSlots: how far ahead a client may ask for a day's slots. */
export const MAX_SLOT_DATE_LOOKAHEAD_DAYS = 180;

export interface OverrideUpsert extends DateOverride {
  date: string;
}

export interface AvailabilityUpdate {
  schedule: WeeklyWindow[];
  bookingRules: BookingRules;
  upserts: OverrideUpsert[];
  deletes: string[];
}

type Obj = Record<string, unknown>;

function bad(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

function asObject(v: unknown, what: string): Obj {
  if (!v || typeof v !== "object" || Array.isArray(v)) bad(`${what} must be an object`);
  return v as Obj;
}

function intIn(v: unknown, min: number, max: number, what: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    bad(`${what} must be an integer from ${min} to ${max}`);
  }
  return v;
}

function timeWindow(v: unknown, what: string): TimeWindow {
  const w = asObject(v, what);
  if (!isTimeKey(w.start) || !isTimeKey(w.end)) bad(`${what}: times must be HH:mm`);
  if (toMinutes(w.start) >= toMinutes(w.end)) bad(`${what}: start must be before end`);
  return { start: w.start, end: w.end };
}

function assertNoOverlap(windows: TimeWindow[], what: string): void {
  const sorted = [...windows].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  for (let i = 1; i < sorted.length; i++) {
    if (toMinutes(sorted[i].start) < toMinutes(sorted[i - 1].end)) bad(`${what}: windows overlap`);
  }
}

function validateSchedule(v: unknown): WeeklyWindow[] {
  if (!Array.isArray(v)) bad("schedule must be an array");
  if (v.length > MAX_SCHEDULE_ENTRIES) bad(`schedule must have at most ${MAX_SCHEDULE_ENTRIES} entries`);
  const schedule = v.map((raw, i): WeeklyWindow => {
    const e = asObject(raw, `schedule[${i}]`);
    const dayOfWeek = intIn(e.dayOfWeek, 0, 6, `schedule[${i}].dayOfWeek`);
    const w = timeWindow({ start: e.startTime, end: e.endTime }, `schedule[${i}]`);
    if (e.isAvailable !== undefined && typeof e.isAvailable !== "boolean") {
      bad(`schedule[${i}].isAvailable must be a boolean`);
    }
    return { dayOfWeek, startTime: w.start, endTime: w.end, isAvailable: e.isAvailable !== false };
  });
  for (let day = 0; day <= 6; day++) {
    const open = schedule
      .filter((s) => s.dayOfWeek === day && s.isAvailable)
      .map((s) => ({ start: s.startTime, end: s.endTime }));
    if (open.length > MAX_WINDOWS_PER_DAY) bad(`day ${day}: at most ${MAX_WINDOWS_PER_DAY} windows`);
    assertNoOverlap(open, `day ${day}`);
  }
  return schedule;
}

function validateRules(v: unknown): BookingRules {
  const r = asObject(v, "bookingRules");
  return {
    bufferMinutes: intIn(r.bufferMinutes, 0, 120, "bookingRules.bufferMinutes"),
    minAdvanceNoticeHours: intIn(r.minAdvanceNoticeHours, 0, 168, "bookingRules.minAdvanceNoticeHours"),
    maxBookingsPerDay: intIn(r.maxBookingsPerDay, 1, 50, "bookingRules.maxBookingsPerDay"),
  };
}

function validateUpsert(v: unknown, i: number): OverrideUpsert {
  const what = `overrides.upsert[${i}]`;
  const o = asObject(v, what);
  if (!isDateKey(o.date)) bad(`${what}.date must be YYYY-MM-DD`);
  if (typeof o.isAvailable !== "boolean") bad(`${what}.isAvailable must be a boolean`);
  const rawWindows = o.windows ?? [];
  if (!Array.isArray(rawWindows) || rawWindows.length > MAX_WINDOWS_PER_DAY) {
    bad(`${what}.windows must be an array of at most ${MAX_WINDOWS_PER_DAY}`);
  }
  const windows = o.isAvailable ? rawWindows.map((w, j) => timeWindow(w, `${what}.windows[${j}]`)) : [];
  assertNoOverlap(windows, what);
  const out: OverrideUpsert = { date: o.date, isAvailable: o.isAvailable, windows };
  if (o.reason !== undefined && o.reason !== null) {
    if (typeof o.reason !== "string") bad(`${what}.reason must be a string`);
    const reason = o.reason.trim().slice(0, MAX_REASON);
    if (reason) out.reason = reason;
  }
  return out;
}

/** Everything updateMyAvailability writes, checked once, before any write. */
export function validateAvailabilityUpdate(data: unknown): AvailabilityUpdate {
  const d = asObject(data, "payload");
  const schedule = validateSchedule(d.schedule);
  const bookingRules = validateRules(d.bookingRules);

  const overrides = asObject(d.overrides ?? { upsert: [], delete: [] }, "overrides");
  const rawUpserts = overrides.upsert ?? [];
  const rawDeletes = overrides.delete ?? [];
  if (!Array.isArray(rawUpserts) || !Array.isArray(rawDeletes)) {
    bad("overrides.upsert and overrides.delete must be arrays");
  }
  if (rawUpserts.length + rawDeletes.length > MAX_OVERRIDE_WRITES) {
    bad(`at most ${MAX_OVERRIDE_WRITES} date exceptions per save`);
  }
  const upserts = rawUpserts.map(validateUpsert);
  const deletes = rawDeletes.map((date, i) => {
    if (!isDateKey(date)) bad(`overrides.delete[${i}] must be YYYY-MM-DD`);
    return date;
  });

  const upsertDates = new Set(upserts.map((u) => u.date));
  if (upsertDates.size !== upserts.length) bad("a date appears twice in overrides.upsert");
  if (deletes.some((date) => upsertDates.has(date))) bad("a date is both upserted and deleted");

  return { schedule, bookingRules, upserts, deletes: [...new Set(deletes)] };
}

function docId(v: unknown, what: string): string {
  if (typeof v !== "string" || v === "" || v.includes("/")) bad(`${what} must be a document id`);
  return v;
}

/** getProviderSlots input. `now` is injectable for tests; defaults to the real clock. */
export function validateSlotsRequest(
  data: unknown,
  now: Date = new Date(),
): { instructorId: string; serviceId: string; date: string } {
  const d = asObject(data, "payload");
  const instructorId = docId(d.instructorId, "instructorId");
  const serviceId = docId(d.serviceId, "serviceId");
  if (!isDateKey(d.date)) bad("date must be YYYY-MM-DD");
  const daysAhead = (romeInstant(d.date, "00:00").getTime() - now.getTime()) / 86_400_000;
  if (daysAhead > MAX_SLOT_DATE_LOOKAHEAD_DAYS) {
    bad(`date must be within ${MAX_SLOT_DATE_LOOKAHEAD_DAYS} days`);
  }
  return { instructorId, serviceId, date: d.date };
}

/**
 * Whether getProviderSlots should offer any times for this instructor at all — the same
 * verification convention as public search results (ai/tools/index.ts) and the instructors
 * read rule: `providerProfile.isVerified`, falling back to a legacy top-level `isVerified` for
 * older documents (see src/users/roles.ts's own fallback for the same field).
 */
export function isBookableInstructor(instructor: Record<string, unknown> | undefined): boolean {
  if (!instructor) return false;
  const profile = instructor.providerProfile as Record<string, unknown> | undefined;
  return (profile?.isVerified ?? instructor.isVerified) === true;
}

/**
 * A service's durationMinutes, checked before it drives the slot grid. A missing or invalid
 * value would otherwise make freeSlots silently return no slots (NaN comparisons are always
 * false) — the customer would see "no times available" instead of the real problem.
 */
export function validateServiceDuration(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > 600) {
    throw new HttpsError("failed-precondition", "service_missing_duration");
  }
  return v;
}

/** Same gate as the /provider area: an approved or pending provider, or staff. */
export function canManageOwnAvailability(user: Record<string, unknown> | undefined): boolean {
  if (!user || user.isDeleted === true) return false;
  return user.providerStatus === "verified" ||
    user.providerStatus === "pending" ||
    user.role === "admin" ||
    user.role === "superadmin";
}

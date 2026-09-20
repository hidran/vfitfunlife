import { normalizeAvailability } from "../ai/search/normalize";
import { isTimeKey, toMinutes, type WeeklyWindow } from "./slots";

type Doc = Record<string, unknown>;

export type BackfillAction =
  | { kind: "copy"; schedule: WeeklyWindow[] } // write to instructors, clear the users-side field
  | { kind: "clear"; reason: "nothing_to_copy" | "kept_newer" } // only clear the users-side field
  | { kind: "skip"; reason: "not_a_candidate" | "deleted" | "no_instructor" };

/**
 * The available windows of a legacy schedule, cleaned so updateMyAvailability would accept
 * them: well-formed HH:mm, start before end, and overlapping windows on a day merged.
 */
export function cleanSchedule(raw: unknown): WeeklyWindow[] {
  const byDay = new Map<number, { start: number; end: number }[]>();
  for (const w of normalizeAvailability(raw)) {
    if (w.isAvailable === false || w.dayOfWeek < 0 || w.dayOfWeek > 6) continue;
    if (!isTimeKey(w.startTime) || !isTimeKey(w.endTime)) continue;
    const start = toMinutes(w.startTime);
    const end = toMinutes(w.endTime);
    if (start >= end) continue;
    byDay.set(w.dayOfWeek, [...(byDay.get(w.dayOfWeek) ?? []), { start, end }]);
  }

  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const out: WeeklyWindow[] = [];
  for (const day of [...byDay.keys()].sort((a, b) => a - b)) {
    const merged: { start: number; end: number }[] = [];
    for (const w of (byDay.get(day) ?? []).sort((a, b) => a.start - b.start)) {
      const last = merged[merged.length - 1];
      if (last && w.start < last.end) last.end = Math.max(last.end, w.end);
      else merged.push({ ...w });
    }
    for (const w of merged) {
      out.push({ dayOfWeek: day, startTime: hhmm(w.start), endTime: hhmm(w.end), isAvailable: true });
    }
  }
  return out;
}

/**
 * What backfillAvailability does for one user. The users-side weekday map is the one the
 * old profile editor wrote; the provider chose it, so it wins over a seeded default — but
 * not over hours they have since saved on /provider/availability.
 */
export function planAvailabilityBackfill(user: Doc, instructor: Doc | undefined): BackfillAction {
  const profile = (user.providerProfile ?? {}) as Doc;
  if (!("availabilitySchedule" in profile)) return { kind: "skip", reason: "not_a_candidate" };
  if (user.isDeleted === true) return { kind: "skip", reason: "deleted" };
  if (!instructor) return { kind: "skip", reason: "no_instructor" };
  if (instructor.availabilityUpdatedAt) return { kind: "clear", reason: "kept_newer" };

  const schedule = cleanSchedule(profile.availabilitySchedule);
  return schedule.length > 0 ? { kind: "copy", schedule } : { kind: "clear", reason: "nothing_to_copy" };
}

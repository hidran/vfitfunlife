/**
 * Canonical provider-catalog (`instructors/{id}`) helpers shared by the
 * seeder and the migration callable, so the canonical shape stays DRY.
 */
import type { AvailabilitySlot } from "./search/match";

/**
 * Canonical demo weekly availability: Mon–Fri (dayOfWeek 1–5) with a
 * morning (09:00–12:00) and afternoon (14:00–18:00) slot, all available.
 */
export function defaultWeeklySchedule(): AvailabilitySlot[] {
  const out: AvailabilitySlot[] = [];
  for (let dayOfWeek = 1; dayOfWeek <= 5; dayOfWeek++) {
    out.push({ dayOfWeek, startTime: "09:00", endTime: "12:00", isAvailable: true });
    out.push({ dayOfWeek, startTime: "14:00", endTime: "18:00", isAvailable: true });
  }
  return out;
}


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

/**
 * Derive a canonical `userType` (kind of provider) from a free-text
 * specialty label. Falls back to "personal_trainer" for fitness-ish work.
 */
export function userTypeForSpecialty(specialty: string): string {
  const s = specialty.toLowerCase();
  if (s.includes("yoga")) return "yoga_teacher";
  if (s.includes("pilates")) return "pilates_instructor";
  if (s.includes("massag")) return "massage_therapist";
  if (s.includes("nutriz") || s.includes("nutrit")) return "nutritionist";
  if (s.includes("psicolog") || s.includes("psychol")) return "psychologist";
  if (s.includes("mental")) return "psychologist";
  if (s.includes("fisioter") || s.includes("osteopat")) return "massage_therapist";
  if (s.includes("danc") || s.includes("zumba")) return "dance_instructor";
  return "personal_trainer";
}

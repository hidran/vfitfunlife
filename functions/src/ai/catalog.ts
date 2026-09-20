/**
 * Canonical provider-catalog (`instructors/{id}`) helpers shared by the
 * seeder and the migration callable, so the canonical shape stays DRY.
 */
import type { AvailabilitySlot } from "./search/match";
import { DEFAULT_WEEKLY_HOURS } from "../availability/slots";

/**
 * Every provider's default weekly hours (Mon–Fri 09:00–17:00) when none exist yet. Mirrors
 * DEFAULT_WEEKLY_HOURS in functions/src/availability/slots.ts — the single source of truth —
 * so the seeder and the catalogue migration never invent a second default.
 */
export function defaultWeeklySchedule(): AvailabilitySlot[] {
  return DEFAULT_WEEKLY_HOURS;
}


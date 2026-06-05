import { AvailabilitySlot } from "./match";

// Day name -> index (0=Sun..6=Sat)
const DAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/**
 * Normalize any legacy availability shape into the canonical
 * `AvailabilitySlot[]` array used by search/matching.
 *
 * Accepts either:
 *  - an already-canonical array of `{ dayOfWeek, startTime, endTime, isAvailable? }`
 *  - a weekday-keyed object `{ monday: { isAvailable, slots:[{start,end}] }, ... }`
 *
 * Anything else (null/undefined/primitive/garbage) yields `[]`.
 */
export function normalizeAvailability(input: unknown): AvailabilitySlot[] {
  if (Array.isArray(input)) {
    // Already canonical-ish: keep entries that have dayOfWeek+startTime+endTime
    return (input as Array<Record<string, unknown>>)
      .filter((s) => s && typeof s.dayOfWeek === "number" && s.startTime && s.endTime)
      .map((s) => ({
        dayOfWeek: s.dayOfWeek as number,
        startTime: s.startTime as string,
        endTime: s.endTime as string,
        isAvailable: s.isAvailable !== false,
      }));
  }
  if (input && typeof input === "object") {
    // Weekday-keyed object: { monday: { isAvailable, slots:[{start,end}] }, ... }
    const out: AvailabilitySlot[] = [];
    for (const [day, val] of Object.entries(input as Record<string, Record<string, unknown>>)) {
      const idx = DAY_INDEX[day.toLowerCase()];
      if (idx === undefined || !val) continue;
      const isAvailable = val.isAvailable !== false;
      const slots = Array.isArray(val.slots) ? (val.slots as Array<Record<string, unknown>>) : [];
      for (const slot of slots) {
        if (slot?.start && slot?.end) {
          out.push({ dayOfWeek: idx, startTime: slot.start as string, endTime: slot.end as string, isAvailable });
        }
      }
    }
    return out;
  }
  return [];
}
